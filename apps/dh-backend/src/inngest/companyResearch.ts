import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { enqueueResearchTask } from "@/lib/listup/tasks";
import type { ResultRef } from "@/lib/listup/types";
import { LocalTaskReporter } from "@/lib/listup/localObservability";
import { notifyWorker } from "@/inngest/client";
import {
  runStructuredOutput,
  runWebSearch,
  type WebSearchResult,
} from "@/lib/listup/openaiWebSearch";

const CLAIM_CATEGORIES = [
  "product_service",
  "target_customer",
  "revenue_model",
  "user_journey",
  "operations",
  "recent_change",
  "public_challenge",
] as const;

type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];
type CompanyIdentity = {
  name: string;
  legalName: string | null;
  aliases: string[];
  websiteUrl: string | null;
};
type ResearchSearch = { key: "profile" | "followup"; input: string };
type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  entityMatched: boolean;
};
type ExtractedClaim = {
  category: ClaimCategory;
  content: string;
  pageIndex: number;
  quote: string;
};

const categoryLabels: Record<ClaimCategory, string> = {
  product_service: "제품·서비스",
  target_customer: "주요 고객",
  revenue_model: "수익 모델",
  user_journey: "사용자 여정",
  operations: "운영 방식",
  recent_change: "최근 변화",
  public_challenge: "공개된 과제",
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function companyNames(company: CompanyIdentity) {
  return [company.name, company.legalName, ...company.aliases]
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());
}

function hasCompanyName(text: string, names: string[]) {
  const haystack = text.toLocaleLowerCase();
  return names.some((name) => haystack.includes(name.toLocaleLowerCase()));
}

function canonicalDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function isHomepage(url: string) {
  try {
    return new URL(url).pathname === "/";
  } catch {
    return false;
  }
}

export function buildResearchSearches(
  company: CompanyIdentity,
  requestedInformation: string[],
): ResearchSearch[] {
  const names = companyNames(company).join(" / ");
  const searches: ResearchSearch[] = [];
  if (!company.websiteUrl) {
    searches.push({
      key: "profile",
      input: [
        "Perform one focused Korean web lookup for this company.",
        `Company names: ${names}`,
        "Find its official homepage, company identity, product or service, customers, and public revenue or pricing information.",
        "Use cited sources only. Do not infer facts. Keep the response concise.",
      ].join("\n"),
    });
  }
  searches.push({
    key: "followup",
    input: requestedInformation.length
      ? [
          "Perform one focused Korean web lookup for this company.",
          `Company names: ${names}`,
          `Find public, cited facts that answer this human research request: ${requestedInformation.join("; ")}`,
          "Use cited sources only. Do not infer facts. Keep the response concise.",
        ].join("\n")
      : [
          "Perform one focused Korean web lookup for this company.",
          `Company names: ${names}`,
          "Find public, cited changes or challenges from the last 12 months, including launches, funding, partnerships, adoption, hiring, or stated issues.",
          "Use cited sources only. Do not infer facts. Keep the response concise.",
        ].join("\n"),
  });
  return searches;
}

export function selectResearchUrls(
  existingWebsiteUrl: string | null,
  searchResults: WebSearchResult[],
) {
  return [
    ...(existingWebsiteUrl && isHttpUrl(existingWebsiteUrl)
      ? [existingWebsiteUrl]
      : []),
    ...searchResults.flatMap((result) => result.sourceUrls),
  ]
    .filter((url, index, urls) => isHttpUrl(url) && urls.indexOf(url) === index)
    .slice(0, 6);
}

async function fetchPage(url: string, names: string[]): Promise<FetchedPage> {
  const response = await fetch(url, {
    headers: { "User-Agent": "dhbot-research/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = (await response.text()).slice(0, 120_000);
  const titleHtml = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleHtml ? textFromHtml(titleHtml).slice(0, 500) : null;
  const text = textFromHtml(html).slice(0, 24_000);
  return {
    url,
    title,
    text,
    entityMatched: hasCompanyName(`${title ?? ""} ${text}`, names),
  };
}

export function validExtractedClaims(
  claims: ExtractedClaim[],
  pages: FetchedPage[],
) {
  const seen = new Set<ClaimCategory>();
  return claims.filter((claim) => {
    const page = pages[claim.pageIndex];
    if (
      !CLAIM_CATEGORIES.includes(claim.category) ||
      seen.has(claim.category) ||
      !claim.content.trim() ||
      !claim.quote.trim() ||
      !page?.entityMatched ||
      !page.text.includes(claim.quote)
    )
      return false;
    seen.add(claim.category);
    return true;
  });
}

function sourceRef(
  key: string,
  result: PromiseSettledResult<WebSearchResult>,
): ResultRef {
  if (result.status === "fulfilled") {
    return {
      type: "source",
      sourceKey: key,
      status: "succeeded",
      foundCount: result.value.sourceUrls.length,
      acceptedCount: 0,
      webSearchCallCount: result.value.webSearchCallCount,
      inputTokens: result.value.inputTokens,
      outputTokens: result.value.outputTokens,
    };
  }
  return {
    type: "source",
    sourceKey: key,
    status: "failed",
    foundCount: 0,
    acceptedCount: 0,
    errorMessage:
      result.reason instanceof Error
        ? result.reason.message
        : "Unknown source error",
  };
}

function savedRefs(value: unknown): ResultRef[] {
  return Array.isArray(value) ? (value as ResultRef[]) : [];
}

async function claimCompanyResearchTask(taskId: string, runId: string) {
  const task = await prisma.researchTask.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "company_research") return null;
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

export async function executeCompanyResearchTask(
  taskId: string,
  runId: string,
) {
  const claimed = await claimCompanyResearchTask(taskId, runId);
  if (!claimed) return { ignored: true };
  const reporter = new LocalTaskReporter(taskId, "company_research");
  try {
    const task = await prisma.researchTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { candidate: { include: { company: true } } },
    });
    if (!task.candidate)
      throw new Error("Company research task has no candidate.");

    const company = task.candidate.company;
    const searches = buildResearchSearches(company, task.requestedInformation);
    const searchOutputs = await Promise.allSettled(
      searches.map((search) =>
        runWebSearch(search.input, {
          onComplete: (metric) =>
            reporter.captureAiCall(`web_search:${search.key}`, metric),
        }),
      ),
    );
    const webRefs = searchOutputs.map((output, index) =>
      sourceRef(
        `OpenAI web search: ${searches[index]?.key ?? "unknown"}`,
        output,
      ),
    );
    const successfulSearches = searchOutputs
      .filter(
        (output): output is PromiseFulfilledResult<WebSearchResult> =>
          output.status === "fulfilled",
      )
      .map((output) => output.value);

    if (!successfulSearches.length) {
      await prisma.researchTask.update({
        where: { id: task.id },
        data: {
          resultRefs: [
            ...savedRefs(task.resultRefs),
            ...webRefs,
          ] as Prisma.InputJsonValue,
        },
      });
      throw new Error("All OpenAI web-search calls failed.");
    }

    const urls = selectResearchUrls(company.websiteUrl, successfulSearches);
    const fetched = await reporter.measure("fetch_cited_pages", () =>
      Promise.allSettled(
        urls.map((url) => fetchPage(url, companyNames(company))),
      ),
    );
    const pages = fetched
      .filter(
        (result): result is PromiseFulfilledResult<FetchedPage> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);
    const fetchRef: ResultRef = {
      type: "source",
      sourceKey: "Cited public pages",
      status: "succeeded",
      foundCount: urls.length,
      acceptedCount: pages.length,
    };

    let claims: ExtractedClaim[] = [];
    let extractedMissingInformation: string[] = [];
    let extractionRef: ResultRef | null = null;
    const eligiblePages = pages.filter((page) => page.entityMatched);
    if (eligiblePages.length) {
      try {
        const extracted = await runStructuredOutput<{
          claims: ExtractedClaim[];
          missingInformation: string[];
        }>(
          [
            "Use only the supplied company pages to create a factual Korean research report.",
            "Return at most one claim for each category. A category is optional when unsupported.",
            "Every quote must be a contiguous, exact excerpt from its page. Do not infer or use outside knowledge.",
            JSON.stringify(
              eligiblePages.map((page, pageIndex) => ({
                pageIndex,
                url: page.url,
                title: page.title,
                text: page.text,
              })),
            ),
          ].join("\n"),
          {
            type: "object",
            additionalProperties: false,
            required: ["claims", "missingInformation"],
            properties: {
              claims: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["category", "content", "pageIndex", "quote"],
                  properties: {
                    category: { type: "string", enum: CLAIM_CATEGORIES },
                    content: { type: "string" },
                    pageIndex: { type: "integer" },
                    quote: { type: "string" },
                  },
                },
              },
              missingInformation: { type: "array", items: { type: "string" } },
            },
          },
          {
            onComplete: (metric) =>
              reporter.captureAiCall("claim_extraction", metric),
          },
        );
        claims = validExtractedClaims(extracted.value.claims, eligiblePages);
        extractedMissingInformation = extracted.value.missingInformation.filter(
          (item): item is string =>
            typeof item === "string" && Boolean(item.trim()),
        );
        extractionRef = {
          type: "source",
          sourceKey: "OpenAI structured extraction",
          status: "succeeded",
          foundCount: extracted.value.claims.length,
          acceptedCount: claims.length,
          webSearchCallCount: 0,
          inputTokens: extracted.inputTokens,
          outputTokens: extracted.outputTokens,
        };
      } catch (error) {
        await prisma.researchTask.update({
          where: { id: task.id },
          data: {
            resultRefs: [
              ...savedRefs(task.resultRefs),
              ...webRefs,
              fetchRef,
            ] as Prisma.InputJsonValue,
          },
        });
        throw error;
      }
    }

    const missingInformation = [
      ...extractedMissingInformation,
      ...CLAIM_CATEGORIES.filter(
        (category) => !claims.some((claim) => claim.category === category),
      ).map((category) => categoryLabels[category]),
    ];
    if (!claims.length && task.requestedInformation.length) {
      missingInformation.push(...task.requestedInformation);
    }

    const result = await prisma.$transaction(async (tx) => {
      const running = await tx.researchTask.findUniqueOrThrow({
        where: { id: task.id },
        include: { candidate: true },
      });
      if (
        running.status !== "running" ||
        running.jobId !== runId ||
        !running.candidate
      )
        return null;

      const evidenceByClaim = new Map<number, string>();
      const sourceEvidenceIds: string[] = [];
      for (const [claimIndex, claim] of claims.entries()) {
        const page = eligiblePages[claim.pageIndex];
        if (!page) continue;
        const evidence = await tx.evidence.create({
          data: {
            companyId: company.id,
            searchRunId: task.searchRunId,
            url: page.url,
            sourceKey:
              company.websiteUrl && page.url === company.websiteUrl
                ? "Official website"
                : "OpenAI web search",
            title: page.title,
            excerpt: claim.quote,
          },
        });
        evidenceByClaim.set(claimIndex, evidence.id);
        sourceEvidenceIds.push(evidence.id);
      }
      if (!claims.length) {
        for (const page of eligiblePages) {
          const evidence = await tx.evidence.create({
            data: {
              companyId: company.id,
              searchRunId: task.searchRunId,
              url: page.url,
              sourceKey:
                company.websiteUrl && page.url === company.websiteUrl
                  ? "Official website"
                  : "OpenAI web search",
              title: page.title,
              excerpt: page.text.slice(0, 1_000),
            },
          });
          sourceEvidenceIds.push(evidence.id);
        }
      }

      const research = await tx.companyResearch.create({
        data: {
          companyId: company.id,
          originSearchRunId: task.searchRunId,
          taskId: task.id,
          missingInformation: [...new Set(missingInformation)].slice(0, 20),
          claims: {
            create: claims.flatMap((claim, claimIndex) => {
              const evidenceId = evidenceByClaim.get(claimIndex);
              return evidenceId
                ? [
                    {
                      category: claim.category,
                      content: claim.content.trim(),
                      basis: "reported_fact",
                      evidenceIds: [evidenceId],
                    },
                  ]
                : [];
            }),
          },
        },
      });

      await tx.candidate.update({
        where: { id: running.candidate.id },
        data: { currentResearchId: research.id },
      });

      const officialPage = eligiblePages.find((page) => isHomepage(page.url));
      if (officialPage) {
        const domain = canonicalDomain(officialPage.url);
        if (domain) {
          await tx.company.update({
            where: { id: company.id },
            data: { websiteUrl: officialPage.url, canonicalDomain: domain },
          });
        }
      }

      const fitTask = await enqueueResearchTask(tx, {
        searchRunId: task.searchRunId,
        candidateId: running.candidate.id,
        parentTaskId: task.id,
        type: "fit_assessment",
        trigger: task.trigger === "userRequest" ? "userRequest" : "searchRun",
        followupPolicy: "automatic",
      });

      const allRefs: ResultRef[] = [
        ...savedRefs(running.resultRefs),
        ...webRefs,
        fetchRef,
        ...(extractionRef ? [extractionRef] : []),
        { type: "companyResearch", id: research.id },
        ...sourceEvidenceIds.map((id) => ({
          type: "evidence" as const,
          id,
        })),
      ];
      await tx.researchTask.update({
        where: { id: task.id },
        data: {
          status: "succeeded",
          resultRefs: allRefs as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return {
        researchId: research.id,
        claimCount: claims.length,
        fitTaskId: fitTask.reused ? null : fitTask.task.id,
      };
    });

    if (result?.fitTaskId) await notifyWorker(result.fitTaskId);
    const output = result ?? { ignored: true };
    reporter.finish("succeeded", {
      ...output,
      webSearches: searches.length,
      citedUrlCount: urls.length,
      fetchedPageCount: pages.length,
      entityMatchedPageCount: eligiblePages.length,
      extractedClaimCount: claims.length,
    });
    return output;
  } catch (error) {
    reporter.finish("failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markCompanyResearchFailed(
  taskId: string,
  message: string,
) {
  await prisma.researchTask.updateMany({
    where: { id: taskId, type: "company_research", status: "running" },
    data: {
      status: "failed",
      errorCode: "SERVICE_UNAVAILABLE",
      errorMessage: message,
      errorRetryable: false,
      finishedAt: new Date(),
    },
  });
}

export async function queuedCompanyResearchTaskIds(limit = 50) {
  const tasks = await prisma.researchTask.findMany({
    where: { type: "company_research", status: "queued" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return tasks.map((task) => task.id);
}
