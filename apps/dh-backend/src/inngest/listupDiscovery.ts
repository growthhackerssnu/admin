import type { Company, Prisma } from "@/generated/prisma";
import type { ConditionsSnapshot } from "@/config/listupExecution";
import { prisma } from "@/lib/prisma";
import { enqueueResearchTask } from "@/lib/listup/tasks";
import type { ResultRef } from "@/lib/listup/types";
import { LocalTaskReporter } from "@/lib/listup/localObservability";
import { notifyWorker } from "@/inngest/client";
import {
  runStructuredOutput,
  runWebSearch,
  type WebSearchResult,
  type WebSearchUsage,
} from "@/lib/listup/openaiWebSearch";

const STARTUP_RECIPE_ARCHIVE =
  "https://startuprecipe.co.kr/archives/invest-newsletter";
const STARTUP_RECIPE_HOSTS = new Set([
  "startuprecipe.co.kr",
  "www.startuprecipe.co.kr",
]);
const STARTUP_RECIPE_LOOKBACK_DAYS = 84;
const STARTUP_RECIPE_MAX_ARCHIVE_PAGES = 12;

type RawFinding = {
  companyName: string;
  sourceKey: string;
  url: string;
  title: string;
  excerpt: string;
  publishedAt: Date | null;
  searchableText: string;
};

type SourceOutput = {
  sourceKey: string;
  findings: RawFinding[];
  extractedCandidateCount?: number;
  validatedCandidateCount?: number;
} & Partial<WebSearchUsage>;

type AggregateFinding = {
  key: string;
  companyName: string;
  findings: RawFinding[];
  score: number;
  newestPublishedAt: Date | null;
};

type DiscoveryResult = {
  ignored?: true;
  cancelled?: true;
  sourceCount?: number;
  candidateCount?: number;
};

function textFromHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompanyName(value: string) {
  return value
    .replace(/주식회사|\(주\)|㈜/gi, "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

function searchTokens(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/i)
    .filter((token) => token.length >= 2);
}

function isStartupRecipeUrl(value: string) {
  try {
    return STARTUP_RECIPE_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function archiveArticleUrls(html: string, baseUrl: string) {
  const urls = new Set<string>();
  for (const match of html.matchAll(
    /href=["']([^"']*\/archives\/invest-newsletter\/\d+\/?)["']/gi,
  )) {
    const url = toAbsoluteUrl(match[1] ?? "", baseUrl);
    if (url && isStartupRecipeUrl(url)) urls.add(url);
  }
  return [...urls];
}

function nextArchiveUrl(html: string, baseUrl: string) {
  const current = Number(baseUrl.match(/\/page\/(\d+)/)?.[1] ?? "1");
  const pages = new Map<number, string>();
  for (const match of html.matchAll(
    /href=["']([^"']*\/archives\/invest-newsletter\/page\/\d+\/?)["']/gi,
  )) {
    const url = toAbsoluteUrl(match[1] ?? "", baseUrl);
    const page = Number(url?.match(/\/page\/(\d+)/)?.[1]);
    if (url && Number.isInteger(page)) pages.set(page, url);
  }
  return pages.get(current + 1) ?? null;
}

function parsePublishedAt(html: string) {
  const dateTime = html.match(/datetime=["']([^"']+)["']/i)?.[1];
  if (dateTime) {
    const parsed = new Date(dateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const korean = html.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!korean) return null;
  return new Date(
    Date.UTC(Number(korean[1]), Number(korean[2]) - 1, Number(korean[3])),
  );
}

function articleTitle(html: string) {
  const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return textFromHtml(title ?? "스타트업레시피 뉴스레터");
}

function tableFindings(
  html: string,
  article: { url: string; title: string; publishedAt: Date | null },
) {
  const findings: RawFinding[] = [];
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableHtml = table[1] ?? "";
    const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (row) =>
        [...(row[1] ?? "").matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(
          (cell) => textFromHtml(cell[1] ?? ""),
        ),
    );
    const header = rows[0] ?? [];
    if (
      !header.some((cell) => cell.includes("기업명")) ||
      !header.some((cell) => /분야|투자|단계/.test(cell))
    )
      continue;
    for (const cells of rows.slice(1)) {
      const companyName = (cells[0] ?? "").trim();
      if (!companyName || companyName.length > 80) continue;
      const excerpt = cells.filter(Boolean).join(" | ");
      findings.push({
        companyName,
        sourceKey: "뉴스레터",
        url: article.url,
        title: article.title,
        excerpt,
        publishedAt: article.publishedAt,
        searchableText: excerpt,
      });
    }
  }
  return findings;
}

function namedListFindings(
  html: string,
  article: { url: string; title: string; publishedAt: Date | null },
) {
  const findings: RawFinding[] = [];
  const sections = html.matchAll(
    /(?:발표 기업|참여 기업)[\s\S]{0,5000}?(?=<h[1-6][^>]*>|$)/gi,
  );
  for (const section of sections) {
    for (const item of (section[0] ?? "").matchAll(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
    )) {
      const excerpt = textFromHtml(item[1] ?? "");
      const companyName = excerpt.split(/[=|:]/)[0]?.trim() ?? "";
      if (!companyName || companyName.length > 80) continue;
      findings.push({
        companyName,
        sourceKey: "뉴스레터",
        url: article.url,
        title: article.title,
        excerpt,
        publishedAt: article.publishedAt,
        searchableText: excerpt,
      });
    }
  }
  return findings;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "dhbot-discovery/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function runNewsletterSource(
  source: ConditionsSnapshot["sources"][number],
): Promise<SourceOutput> {
  const cutoff = new Date(
    Date.now() - STARTUP_RECIPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const articleUrls = new Set(source.entryUrls.filter(isStartupRecipeUrl));
  const visitedArchiveUrls = new Set<string>();
  let archiveUrl: string | null = STARTUP_RECIPE_ARCHIVE;

  for (
    let page = 0;
    archiveUrl && page < STARTUP_RECIPE_MAX_ARCHIVE_PAGES;
    page += 1
  ) {
    if (visitedArchiveUrls.has(archiveUrl)) break;
    visitedArchiveUrls.add(archiveUrl);
    const html = await fetchText(archiveUrl);
    archiveArticleUrls(html, archiveUrl).forEach((url) => articleUrls.add(url));
    archiveUrl = nextArchiveUrl(html, archiveUrl);
  }

  const findings: RawFinding[] = [];
  for (const url of articleUrls) {
    const html = await fetchText(url);
    const publishedAt = parsePublishedAt(html);
    if (publishedAt && publishedAt < cutoff) continue;
    const article = { url, title: articleTitle(html), publishedAt };
    findings.push(
      ...tableFindings(html, article),
      ...namedListFindings(html, article),
    );
  }
  return { sourceKey: source.key, findings };
}

function queryTerms(
  source: ConditionsSnapshot["sources"][number],
  filters: ConditionsSnapshot["filters"],
) {
  return (
    [
      source.query,
      ...filters.keywords,
      ...filters.industries,
      ...filters.regions,
      filters.additionalConditions,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" ")
      .slice(0, 180) || "한국 스타트업"
  );
}

export function discoveryRound(requestedInformation: string[]) {
  const value = requestedInformation.find((item) =>
    item.startsWith("discovery_round:"),
  );
  const round = Number(value?.split(":")[1]);
  return Number.isInteger(round) && round > 0 ? round : 1;
}

function discoveryLimit(requestedInformation: string[], fallback: number) {
  const value = requestedInformation.find((item) =>
    item.startsWith("discovery_limit:"),
  );
  const limit = Number(value?.split(":")[1]);
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, fallback)
    : fallback;
}

export function buildGoogleQueries(
  source: ConditionsSnapshot["sources"][number],
  filters: ConditionsSnapshot["filters"],
  round = 1,
) {
  const terms = queryTerms(source, filters);
  const stages = filters.companyStages.length
    ? filters.companyStages.join(" OR ")
    : "투자 유치 OR 시드 OR 프리시리즈A OR 시리즈A";
  if (round > 1) {
    const lenses = [
      [
        "customer acquisition retention conversion",
        "partnership hiring market expansion",
        "data AI operations automation",
      ],
      [
        "monetization pricing revenue",
        "new market enterprise adoption",
        "product experiment service expansion",
      ],
    ][Math.min(round, 3) - 2]!;
    return lenses.map((lens) => `${terms} (${stages}) (${lens})`);
  }
  return [
    `${terms} (스타트업 OR 기업) (${stages})`,
    `${terms} (정식 출시 OR 서비스 출시 OR 론칭 OR 베타)`,
    `${terms} 스타트업`,
  ];
}

async function runGoogleSource(
  source: ConditionsSnapshot["sources"][number],
  filters: ConditionsSnapshot["filters"],
  round: number,
  excludedCompanyNames: string[],
  reporter?: LocalTaskReporter,
): Promise<SourceOutput> {
  const results: WebSearchResult[] = [];
  for (const query of buildGoogleQueries(source, filters, round)) {
    try {
      results.push(
        await runWebSearch(
          [
            "Perform one focused Korean web lookup for startup discovery.",
            `Discovery round: ${round}. Use this distinct search lens rather than prior results.`,
            `Search focus: ${query}`,
            ...(excludedCompanyNames.length
              ? [
                  `Do not return already-reviewed companies: ${excludedCompanyNames.slice(0, 80).join(" / ")}`,
                ]
              : []),
            "Return only companies explicitly named in sourced pages. Do not judge fit or invent facts; every candidate needs a source citation.",
          ].join("\n"),
          {
            onComplete: (metric) =>
              reporter?.captureAiCall("web_search", metric),
          },
        ),
      );
    } catch {
      // Preserve results from other bounded queries. The task fails only when
      // every Google query failed, matching source-level partial completion.
    }
  }
  if (!results.length) throw new Error("All Google discovery queries failed.");
  const extracted = await runStructuredOutput<{
    candidates: {
      searchIndex: number;
      companyName: string;
      quote: string;
      sourceUrl: string;
    }[];
  }>(
    [
      "Extract startup candidates only from the supplied web-search summaries.",
      "A candidate name and quote must appear verbatim in its summary. sourceUrl must be a listed URL for that summary.",
      JSON.stringify(
        results.map((result, searchIndex) => ({
          searchIndex,
          sourceUrls: result.sourceUrls,
          summary: result.text,
        })),
      ),
    ].join("\n"),
    {
      type: "object",
      additionalProperties: false,
      required: ["candidates"],
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["searchIndex", "companyName", "quote", "sourceUrl"],
            properties: {
              searchIndex: { type: "integer" },
              companyName: { type: "string" },
              quote: { type: "string" },
              sourceUrl: { type: "string" },
            },
          },
        },
      },
    },
    {
      onComplete: (metric) =>
        reporter?.captureAiCall("candidate_extraction", metric),
    },
  );
  const findings: RawFinding[] = [];
  const excluded = new Set(excludedCompanyNames.map(normalizeCompanyName));
  for (const candidate of extracted.value.candidates) {
    const result = results[candidate.searchIndex];
    if (
      !result ||
      !candidate.companyName.trim() ||
      !candidate.quote.includes(candidate.companyName) ||
      !result.text.includes(candidate.quote) ||
      !result.sourceUrls.includes(candidate.sourceUrl) ||
      excluded.has(normalizeCompanyName(candidate.companyName))
    )
      continue;
    findings.push({
      companyName: candidate.companyName.trim(),
      sourceKey: "Google",
      url: candidate.sourceUrl,
      title: "OpenAI web search",
      excerpt: candidate.quote,
      publishedAt: null,
      searchableText: candidate.quote,
    });
  }
  return {
    sourceKey: source.key,
    findings,
    extractedCandidateCount: extracted.value.candidates.length,
    validatedCandidateCount: findings.length,
    webSearchCallCount: results.reduce(
      (total, result) => total + result.webSearchCallCount,
      0,
    ),
    inputTokens:
      results.reduce((total, result) => total + result.inputTokens, 0) +
      extracted.inputTokens,
    outputTokens:
      results.reduce((total, result) => total + result.outputTokens, 0) +
      extracted.outputTokens,
  };
}

async function collectSource(
  source: ConditionsSnapshot["sources"][number],
  filters: ConditionsSnapshot["filters"],
  round: number,
  excludedCompanyNames: string[],
  reporter?: LocalTaskReporter,
) {
  if (source.key === "Google")
    return runGoogleSource(
      source,
      filters,
      round,
      excludedCompanyNames,
      reporter,
    );
  if (source.key === "뉴스레터") return runNewsletterSource(source);
  throw new Error(`Unsupported discovery source: ${source.key}`);
}

function scoreFinding(
  group: Omit<AggregateFinding, "score" | "newestPublishedAt">,
  snapshot: ConditionsSnapshot,
) {
  const text = group.findings
    .map((finding) => finding.searchableText)
    .join(" ")
    .toLowerCase();
  const matchCount = (values: string[]) =>
    values.filter((value) => text.includes(value.toLowerCase())).length;
  const newest = group.findings.reduce<Date | null>((current, finding) => {
    if (!finding.publishedAt || (current && current >= finding.publishedAt))
      return current;
    return finding.publishedAt;
  }, null);
  const age = newest ? Date.now() - newest.getTime() : Number.POSITIVE_INFINITY;
  const freshness =
    age <= 30 * 24 * 60 * 60 * 1000
      ? 2
      : age <= STARTUP_RECIPE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
        ? 1
        : 0;
  const sourceCount = new Set(
    group.findings.map((finding) => finding.sourceKey),
  ).size;
  const additionalTerms = [
    ...searchTokens(snapshot.filters.additionalConditions),
    ...snapshot.sources.flatMap((source) => searchTokens(source.query)),
  ];
  const score =
    matchCount(snapshot.filters.keywords) * 3 +
    matchCount(snapshot.filters.industries) * 2 +
    matchCount(snapshot.filters.companyStages) * 2 +
    matchCount(snapshot.filters.regions) +
    matchCount(additionalTerms) +
    Math.max(0, sourceCount - 1) * 2 +
    freshness;
  return { score, newestPublishedAt: newest };
}

function aggregateFindings(
  findings: RawFinding[],
  snapshot: ConditionsSnapshot,
) {
  const groups = new Map<
    string,
    Omit<AggregateFinding, "score" | "newestPublishedAt">
  >();
  for (const finding of findings) {
    const key = normalizeCompanyName(finding.companyName);
    if (!key) continue;
    const group = groups.get(key) ?? {
      key,
      companyName: finding.companyName,
      findings: [],
    };
    group.findings.push(finding);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, ...scoreFinding(group, snapshot) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.newestPublishedAt?.getTime() ?? 0) -
          (a.newestPublishedAt?.getTime() ?? 0) ||
        a.companyName.localeCompare(b.companyName, "ko"),
    );
}

function sourceRefs(
  outputs: PromiseSettledResult<SourceOutput>[],
  sources: ConditionsSnapshot["sources"],
): ResultRef[] {
  return outputs.map((output, index) => {
    if (output.status === "fulfilled") {
      return {
        type: "source",
        sourceKey: output.value.sourceKey,
        status: "succeeded",
        foundCount: output.value.findings.length,
        acceptedCount: 0,
        ...(output.value.webSearchCallCount === undefined
          ? {}
          : {
              webSearchCallCount: output.value.webSearchCallCount,
              inputTokens: output.value.inputTokens ?? 0,
              outputTokens: output.value.outputTokens ?? 0,
            }),
      };
    }
    return {
      type: "source",
      sourceKey: sources[index]?.key ?? `source-${index + 1}`,
      status: "failed",
      foundCount: 0,
      acceptedCount: 0,
      errorMessage:
        output.reason instanceof Error
          ? output.reason.message
          : "Unknown source error",
    };
  });
}

function addAcceptedCounts(refs: ResultRef[], accepted: AggregateFinding[]) {
  return refs.map((ref) => {
    if (ref.type !== "source" || ref.status !== "succeeded") return ref;
    const acceptedCount = accepted.filter((group) =>
      group.findings.some((finding) => finding.sourceKey === ref.sourceKey),
    ).length;
    return { ...ref, acceptedCount };
  });
}

function existingCompaniesByName(companies: Company[]) {
  const byName = new Map<string, Company[]>();
  for (const company of companies) {
    for (const name of [company.name, ...company.aliases]) {
      const key = normalizeCompanyName(name);
      if (!key) continue;
      const matches = byName.get(key) ?? [];
      if (!matches.some((match) => match.id === company.id))
        byName.set(key, [...matches, company]);
    }
  }
  return byName;
}

async function persistFindings(
  taskId: string,
  groups: AggregateFinding[],
  refs: ResultRef[],
  maxCandidates: number,
) {
  const createdTaskIds = await prisma.$transaction(async (tx) => {
    const task = await tx.researchTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { searchRun: true },
    });
    if (task.status !== "running" || task.searchRun.status === "cancelled") {
      if (task.status === "running") {
        await tx.researchTask.update({
          where: { id: task.id },
          data: { status: "cancelled", finishedAt: new Date() },
        });
      }
      return null;
    }
    const snapshot = task.searchRun
      .conditionsSnapshot as unknown as ConditionsSnapshot;
    const candidateNames = groups.map((group) => group.companyName);
    const candidateNameVariants = [
      ...new Set(
        candidateNames.flatMap((name) => [
          name,
          name.replace(/^(?:주식회사\s*|\(주\)\s*|㈜\s*)/i, "").trim(),
        ]),
      ),
    ];
    const companies = await tx.company.findMany({
      where: {
        OR: [
          { name: { in: candidateNameVariants } },
          { aliases: { hasSome: candidateNameVariants } },
        ],
      },
    });
    const byName = existingCompaniesByName(companies);
    const existingCandidates = await tx.candidate.findMany({
      where: { companyId: { in: companies.map((company) => company.id) } },
      select: { companyId: true },
    });
    const candidateCompanyIds = new Set(
      existingCandidates.map((candidate) => candidate.companyId),
    );
    const excludedCompanyIds = new Set(snapshot.filters.excludedCompanyIds);
    const resultRefs: ResultRef[] = [...refs];
    const researchTaskIds: string[] = [];
    let duplicateExcludedCount = 0;
    const accepted: AggregateFinding[] = [];

    for (const group of groups) {
      if (accepted.length >= maxCandidates) break;
      const matches = byName.get(group.key) ?? [];
      if (matches.length > 1) continue;
      let company = matches[0];
      if (
        company &&
        (company.permanentlyExcluded ||
          excludedCompanyIds.has(company.id) ||
          candidateCompanyIds.has(company.id))
      ) {
        duplicateExcludedCount += 1;
        continue;
      }
      if (!company)
        company = await tx.company.create({
          data: { name: group.companyName },
        });
      const evidence = await Promise.all(
        group.findings.map((finding) =>
          tx.evidence.create({
            data: {
              companyId: company.id,
              searchRunId: task.searchRunId,
              url: finding.url,
              sourceKey: finding.sourceKey,
              title: finding.title,
              excerpt: finding.excerpt,
              publishedAt: finding.publishedAt,
            },
          }),
        ),
      );
      try {
        const candidate = await tx.candidate.create({
          data: {
            originSearchRunId: task.searchRunId,
            companyId: company.id,
            discoveryEvidenceIds: evidence.map((item) => item.id),
          },
        });
        const researchTask = await enqueueResearchTask(tx, {
          searchRunId: task.searchRunId,
          candidateId: candidate.id,
          parentTaskId: task.id,
          type: "company_research",
          trigger: "searchRun",
          followupPolicy: "automatic",
        });
        if (!researchTask.reused) researchTaskIds.push(researchTask.task.id);
        resultRefs.push(
          { type: "candidate", id: candidate.id },
          ...evidence.map((item) => ({
            type: "evidence" as const,
            id: item.id,
          })),
        );
        accepted.push(group);
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2002"
          )
        )
          throw error;
        duplicateExcludedCount += 1;
      }
    }

    await tx.searchRun.update({
      where: { id: task.searchRunId },
      data: { duplicateExcludedCount: { increment: duplicateExcludedCount } },
    });
    await tx.researchTask.update({
      where: { id: task.id },
      data: {
        status: "succeeded",
        resultRefs: addAcceptedCounts(
          resultRefs,
          accepted,
        ) as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    return { candidateCount: accepted.length, researchTaskIds };
  });
  if (!createdTaskIds) return { cancelled: true };
  await Promise.all(createdTaskIds.researchTaskIds.map(notifyWorker));
  return { candidateCount: createdTaskIds.candidateCount };
}

async function claimDiscoveryTask(taskId: string, runId: string) {
  const task = await prisma.researchTask.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "company_discovery") return null;
  const claim = await prisma.researchTask.updateMany({
    where: { id: taskId, status: "queued" },
    data: {
      status: "running",
      jobId: runId,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      errorRetryable: null,
    },
  });
  if (claim.count) return true;
  if (task.status !== "running" || task.jobId !== runId) return false;
  await prisma.researchTask.update({
    where: { id: taskId },
    data: { attempt: { increment: 1 } },
  });
  return true;
}

export async function executeDiscoveryTask(
  taskId: string,
  runId: string,
): Promise<DiscoveryResult> {
  const claimed = await claimDiscoveryTask(taskId, runId);
  if (!claimed) return { ignored: true };
  const reporter = new LocalTaskReporter(taskId, "company_discovery");
  try {
    const task = await prisma.researchTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { searchRun: true },
    });
    const snapshot = task.searchRun
      .conditionsSnapshot as unknown as ConditionsSnapshot;
    const round = discoveryRound(task.requestedInformation);
    const limit = discoveryLimit(
      task.requestedInformation,
      snapshot.execution.maxCompanies,
    );
    await prisma.searchRun.updateMany({
      where: { id: task.searchRunId, status: "queued" },
      data: { status: "running", startedAt: new Date() },
    });

    const sources =
      round === 1
        ? snapshot.sources
        : snapshot.sources.filter((source) => source.key === "Google");
    const reviewedCompanies =
      round === 1
        ? []
        : await prisma.candidate.findMany({
            where: { originSearchRunId: task.searchRunId },
            select: { company: { select: { name: true, aliases: true } } },
          });
    const excludedCompanyNames = reviewedCompanies.flatMap((candidate) => [
      candidate.company.name,
      ...candidate.company.aliases,
    ]);
    const outputs = await reporter.measure("collect_sources", () =>
      Promise.allSettled(
        sources.map((source) =>
          collectSource(
            source,
            snapshot.filters,
            round,
            excludedCompanyNames,
            reporter,
          ),
        ),
      ),
    );
    const refs = sourceRefs(outputs, sources);
    const successful = outputs.filter(
      (output): output is PromiseFulfilledResult<SourceOutput> =>
        output.status === "fulfilled",
    );
    if (!successful.length) {
      await prisma.researchTask.update({
        where: { id: taskId },
        data: { resultRefs: refs as Prisma.InputJsonValue },
      });
      throw new Error("All selected discovery sources failed.");
    }

    const merged = aggregateFindings(
      successful.flatMap((output) => output.value.findings),
      snapshot,
    );
    const persisted = await reporter.measure("persist_candidates", () =>
      persistFindings(taskId, merged, refs, limit),
    );
    if (persisted.cancelled) {
      reporter.finish("succeeded", { cancelled: true });
      return { cancelled: true };
    }
    const result = {
      sourceCount: successful.length,
      candidateCount: persisted.candidateCount,
      round,
    };
    reporter.finish("succeeded", {
      ...result,
      sourceFindingCount: successful.reduce(
        (count, output) => count + output.value.findings.length,
        0,
      ),
      uniqueCandidateCount: merged.length,
      extractedCandidateCount: successful.reduce(
        (count, output) => count + (output.value.extractedCandidateCount ?? 0),
        0,
      ),
      validatedCandidateCount: successful.reduce(
        (count, output) => count + (output.value.validatedCandidateCount ?? 0),
        0,
      ),
    });
    return result;
  } catch (error) {
    reporter.finish("failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markDiscoveryFailed(taskId: string, message: string) {
  await prisma.$transaction(async (tx) => {
    const task = await tx.researchTask.findUnique({ where: { id: taskId } });
    if (!task || task.type !== "company_discovery" || task.status !== "running")
      return;
    await tx.researchTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        errorCode: "SERVICE_UNAVAILABLE",
        errorMessage: message,
        errorRetryable: false,
        finishedAt: new Date(),
      },
    });
  });
}

export async function queuedDiscoveryTaskIds(limit = 50) {
  const tasks = await prisma.researchTask.findMany({
    where: { type: "company_discovery", status: "queued" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return tasks.map((task) => task.id);
}
