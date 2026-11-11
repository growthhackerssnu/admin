import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { enqueueResearchTask } from "@/dh/lib/listup/tasks";
import type { ResultRef } from "@/dh/lib/listup/types";
import { LocalTaskReporter } from "@/dh/lib/listup/localObservability";
import { notifyWorker } from "@/dh/inngest/client";
import {
  runStructuredOutput,
  runWebSearch,
  type WebSearchResult,
} from "@/dh/lib/listup/gemini";

const CLAIM_CATEGORIES = [
  "product_service",
  "target_customer",
  "revenue_model",
  "user_journey",
  // operations(운영 방식)는 정의가 애매해 보류. DB enum에는 남아 있어 다시 넣으면 된다.
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
  publishedAt: string | null;
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

// 띄어쓰기·기호 차이("어니스트 플라워" ↔ "어니스트플라워")로 같은 기업을 놓치지 않게 비교한다.
const squash = (value: string) => value.toLocaleLowerCase().replace(/[\s\-_.·]/g, "");

export function hasCompanyName(text: string, names: string[]) {
  const haystack = squash(text);
  return names.some((name) => haystack.includes(squash(name)));
}

// 이름이 한 번 스치듯 나오는 페이지(기관 공지 목록, 채용 사이트 목록 등)는 빼고, 제목에 있거나 본문에 2번 이상 나오는 페이지만 쓴다.
// ponytail: 횟수 기준 휴리스틱. 무관한 페이지가 계속 섞이면 모델 판정으로 바꾸기.
export function isAboutCompany(title: string | null, text: string, names: string[]) {
  if (title && hasCompanyName(title, names)) return true;
  const haystack = squash(text);
  return names.some((name) => {
    const needle = squash(name);
    return needle.length > 0 && haystack.split(needle).length - 1 >= 2;
  });
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

// ponytail: 흔한 메타 태그만 본다(속성 순서가 property → content인 경우). 날짜가 자주 빠지면 JSON-LD datePublished도 읽기.
export function publishedAtFromHtml(html: string) {
  return (
    html.match(
      /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished|pubdate|date)["'][^>]*content=["']([^"']+)["']/i,
    )?.[1] ?? null
  );
}

async function fetchPage(url: string, names: string[]): Promise<FetchedPage> {
  // 국내 언론사 일부가 봇 UA를 403으로 막아서 일반 브라우저 헤더로 요청한다.
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.url || url}`);
  const html = (await response.text()).slice(0, 120_000);
  const titleHtml = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleHtml ? textFromHtml(titleHtml).slice(0, 500) : null;
  const text = textFromHtml(html).slice(0, 24_000);
  return {
    // Gemini 인용 URL은 만료되는 중계 링크(grounding-api-redirect)라 리다이렉트 후 실제 주소를 저장한다.
    url: response.url || url,
    title,
    publishedAt: publishedAtFromHtml(html),
    text,
    entityMatched: isAboutCompany(title, text, names),
  };
}

export function validExtractedClaims(
  claims: ExtractedClaim[],
  pages: FetchedPage[],
  names: string[],
) {
  const seen = new Set<ClaimCategory>();
  // 모델이 공백·기호만 바꿔 인용해도 버리지 않도록 squash 후 비교한다.
  // 제목에 회사 이름이 없는 페이지(투자 포트폴리오·선정 기업 목록 기사 등)는 여러 회사를 다루므로,
  // 인용문에 이 회사 이름이 있어야 이 회사에 대한 사실로 인정한다.
  const contains = (index: number, quote: string) => {
    const page = pages[index];
    if (!page?.entityMatched || !squash(page.text).includes(squash(quote))) return false;
    return (page.title && hasCompanyName(page.title, names)) || hasCompanyName(quote, names);
  };
  return claims.flatMap((claim) => {
    if (
      !CLAIM_CATEGORIES.includes(claim.category) ||
      seen.has(claim.category) ||
      !claim.content.trim() ||
      !claim.quote.trim()
    )
      return [];
    // 인용문은 정확한데 페이지 번호만 틀리는 경우가 있어, 다른 페이지에서 찾으면 번호를 고친다.
    const pageIndex = contains(claim.pageIndex, claim.quote)
      ? claim.pageIndex
      : pages.findIndex((_, index) => contains(index, claim.quote));
    if (pageIndex === -1) return [];
    seen.add(claim.category);
    return [{ ...claim, pageIndex }];
  });
}

const categoryDefinitions: Record<ClaimCategory, string> = {
  product_service: "what the company sells — products, services, key features.",
  target_customer:
    "who buys or uses it — customer segments, plus named client/partner/MOU companies when the pages name them.",
  revenue_model:
    "how it earns money — subscription, licensing, commission, per-unit sales, pricing.",
  user_journey:
    "how customers find, adopt, and use the product, and what data that usage produces.",
  recent_change:
    "dated events in the last 12 months — launches, funding, partnerships, expansion.",
  public_challenge: "problems or goals the company has stated publicly.",
};

const BASE_CONTENT_RULE =
  "Korean. Omit the company name as subject. Noun-ending style (~ 확보, ~ 운영), under 120 characters. No filler like '~이 포함됩니다', '~하고 있습니다', '주요 ~에는'. Name specific companies, institutions, products, numbers whenever stated.";

// 카테고리별 형식 규칙은 스키마 description에 둬서 모델이 그 필드를 쓰는 순간 보게 한다.
// 예시는 가상의 이름만 쓴다. 실제 기업 예시를 넣었더니 모델이 그 문장을 quote로 베껴 검증에서 버려졌다.
const contentRules: Partial<Record<ClaimCategory, string>> = {
  product_service:
    "List named products as 'name(short description)' joined by ', ' — every name gets a description, no trailing verb. Format example (fictional): '가나페이(간편결제 앱), 가나POS(소상공인용 POS)'. Bad: '가나페이, 가나POS 제공'. Use '~ 제공' only when no product name exists.",
  target_customer:
    "Named client/partner/MOU companies first, then segments. Format example (fictional): '다라물산, 마바학교 등 수도권 소매사업자'.",
  recent_change:
    "The event only, WITHOUT any date (the date goes in eventMonth). Format example (fictional): '사아벤처스 등 3개사로부터 30억 원 규모 시리즈A 투자 유치'.",
};

const QUOTE_RULE =
  "One sentence copied character-for-character from that page's text: no rewording, no merging sentences, no added parentheses or formatting. It is checked by exact string match; a non-matching quote discards the claim.";

type CategoryExtraction = {
  found: boolean;
  content: string;
  pageIndex: number;
  quote: string;
  eventMonth?: string;
};

// 모델이 형식을 어겨도 결과가 일정하도록 규칙 중 기계적으로 고칠 수 있는 것은 코드로 맞춘다.
export function formatClaimContent(category: ClaimCategory, item: CategoryExtraction) {
  let content = item.content.trim();
  if (category === "product_service" && content.includes("(")) {
    content = content.replace(/\s*(등을?\s*)?제공(합니다|한다|함)?\.?$/, "").trim();
  }
  if (category === "recent_change") {
    content = content.replace(/^\d{4}년\s*\d{1,2}월\s*/, "");
    const month = item.eventMonth?.match(/^(\d{4})-(\d{2})$/);
    if (month) content = `${month[1]}년 ${Number(month[2])}월 ${content}`;
  }
  return content;
}

export function claimsFromExtraction(
  extracted: Partial<Record<ClaimCategory, CategoryExtraction>>,
): ExtractedClaim[] {
  return CLAIM_CATEGORIES.flatMap((category) => {
    const item = extracted[category];
    return item?.found
      ? [{ category, content: formatClaimContent(category, item), pageIndex: item.pageIndex, quote: item.quote }]
      : [];
  });
}

// 카테고리마다 required 키로 두어 모델이 모든 항목을 판단하게 한다. 근거가 없으면 found=false.
async function extractClaims(
  names: string[],
  pages: FetchedPage[],
  pageIndexOffset: number,
  categories: readonly ClaimCategory[],
  onComplete: NonNullable<Parameters<typeof runStructuredOutput>[2]>["onComplete"],
) {
  const extracted = await runStructuredOutput<{
    claims: Partial<Record<ClaimCategory, CategoryExtraction>>;
    missingInformation: string[];
  }>(
    [
      `Target company: ${names.join(" / ")}. Use only the supplied pages to create a factual Korean research report about this company only.`,
      "Some pages cover several companies (investment portfolio news, accelerator cohorts, award or selection lists). From those, use only sentences about the target company. Never report other companies' products or customers, or an investor's activity (e.g. '8개사 신규 투자'), as the target's. Each quote must be about the target company.",
      "Fill every category. Read all pages carefully before deciding a category is unsupported — facts may be indirect (pricing pages, case studies, press releases). Only when no page supports it, set found=false with empty content and quote and pageIndex -1.",
      "The report is used to design a data analysis project with this company. Prefer facts about what the company sells, to whom, how it earns money, and how users or customers use the product and generate data. Skip certifications, awards, executive biographies, and boilerplate.",
      "Every quote must be a contiguous, exact excerpt from its page. Do not infer or use outside knowledge.",
      "Categories:",
      ...categories.map((category) => `- ${category}: ${categoryDefinitions[category]}`),
      "Follow each content field's description exactly — it holds the required format for that category. Start with the fact itself, never with the company name (Bad: '가나테크는 ... 제공합니다').",
      "eventMonth (recent_change): the month the event actually happened, as YYYY-MM — not the article's publish month. Resolve relative phrases ('지난 6월', '올해 3월', '최근') against that page's publishedAt; use publishedAt's month only when the event month cannot be determined; '' when no date at all.",
      JSON.stringify(
        pages.map((page, index) => ({
          pageIndex: pageIndexOffset + index,
          url: page.url,
          title: page.title,
          publishedAt: page.publishedAt,
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
          type: "object",
          additionalProperties: false,
          required: [...categories],
          properties: Object.fromEntries(
            categories.map((category) => [
              category,
              // quote → eventMonth → content 순서로 근거를 먼저 쓰고 나서 요약하게 한다.
              {
                type: "object",
                additionalProperties: false,
                required: [
                  "found",
                  "pageIndex",
                  "quote",
                  ...(category === "recent_change" ? ["eventMonth"] : []),
                  "content",
                ],
                properties: {
                  found: { type: "boolean" },
                  pageIndex: { type: "integer" },
                  quote: { type: "string", description: QUOTE_RULE },
                  ...(category === "recent_change"
                    ? { eventMonth: { type: "string", description: "YYYY-MM of the event itself, or ''." } }
                    : {}),
                  content: {
                    type: "string",
                    description: [BASE_CONTENT_RULE, contentRules[category]].filter(Boolean).join(" "),
                  },
                },
              },
            ]),
          ),
        },
        missingInformation: { type: "array", items: { type: "string" } },
      },
    },
    { onComplete },
  );
  return {
    claims: claimsFromExtraction(extracted.value.claims ?? {}),
    missingInformation: (extracted.value.missingInformation ?? []).filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim()),
    ),
    inputTokens: extracted.inputTokens,
    outputTokens: extracted.outputTokens,
  };
}

export function buildGapSearch(
  company: CompanyIdentity,
  gaps: readonly ClaimCategory[],
) {
  return [
    "Perform one focused Korean web lookup for this company.",
    `Company names: ${companyNames(company).join(" / ")}`,
    "Find public, cited facts for each topic below. Prefer pricing pages, customer case studies, partnership/MOU press releases, and recent news.",
    ...gaps.map((category) => `- ${categoryLabels[category]}: ${categoryDefinitions[category]}`),
    "Use cited sources only. Do not infer facts. Keep the response concise.",
  ].join("\n");
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
  if (claim.count) {
    if (task.pipeline === "human_review" && task.candidateId) {
      await prisma.candidate.update({
        where: { id: task.candidateId },
        data: { researchStatus: "running" },
      });
    }
    return true;
  }
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
      include: {
        candidate: {
          include: {
            company: true,
            originCollectedCompany: { include: { item: true } },
          },
        },
      },
    });
    if (!task.searchRunId || !task.candidate)
      throw new Error("Company research task has no candidate.");
    const legacySearchRunId = task.searchRunId;

    const company = task.candidate.company;
    const searches = buildResearchSearches(company, task.requestedInformation);
    const searchOutputs = await Promise.allSettled(
      searches.map(async (search) => {
        const run = (input: string) =>
          runWebSearch(input, {
            onComplete: (metric) =>
              reporter.captureAiCall(`web_search:${search.key}`, metric),
          });
        const first = await run(search.input);
        // 모델이 검색을 건너뛰고 기억으로 답하면 인용 URL이 없어 조사가 비어 버린다. 검색을 요구하며 한 번만 다시 시도한다.
        if (first.sourceUrls.length) return first;
        const retry = await run(
          `${search.input}\nYou MUST use Google Search for this request. Do not answer from memory.`,
        );
        return {
          ...retry,
          webSearchCallCount: first.webSearchCallCount + retry.webSearchCallCount,
          inputTokens: first.inputTokens + retry.inputTokens,
          outputTokens: first.outputTokens + retry.outputTokens,
        };
      }),
    );
    const webRefs = searchOutputs.map((output, index) =>
      sourceRef(
        `Gemini Google Search: ${searches[index]?.key ?? "unknown"}`,
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
      const quotaExceeded = searchOutputs.some((output) =>
        output.status === "rejected" &&
        /RESOURCE_EXHAUSTED|\b429\b/.test(String(output.reason)),
      );
      throw new Error(quotaExceeded
        ? "Gemini 조사 사용량 한도에 도달했습니다. 한도 복구 후 다시 조사해주세요."
        : "모든 Gemini 웹 검색 요청이 실패했습니다. 다시 조사해주세요.");
    }

    const urls = [
      ...selectResearchUrls(company.websiteUrl, successfulSearches),
      ...(task.pipeline === "human_review" && task.candidate.originCollectedCompany?.item.url
        ? [task.candidate.originCollectedCompany.item.url]
        : []),
    ].filter((url, index, all) => all.indexOf(url) === index).slice(0, 7);
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
        const extracted = await extractClaims(
          companyNames(company),
          eligiblePages,
          0,
          CLAIM_CATEGORIES,
          (metric) => reporter.captureAiCall("claim_extraction", metric),
        );
        claims = validExtractedClaims(extracted.claims, eligiblePages, companyNames(company));
        extractedMissingInformation = extracted.missingInformation;
        extractionRef = {
          type: "source",
          sourceKey: "Gemini structured extraction",
          status: "succeeded",
          foundCount: extracted.claims.length,
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

    // 빈 항목만 골라 한 번 더 검색·추출한다. 실패해도 1차 결과로 저장한다.
    const gaps = CLAIM_CATEGORIES.filter(
      (category) => !claims.some((claim) => claim.category === category),
    );
    if (gaps.length) {
      const [gapSearch] = await Promise.allSettled([
        runWebSearch(buildGapSearch(company, gaps), {
          onComplete: (metric) =>
            reporter.captureAiCall("web_search:gap_fill", metric),
        }),
      ]);
      webRefs.push(sourceRef("Gemini Google Search: gap_fill", gapSearch!));
      if (gapSearch!.status === "fulfilled") {
        const gapUrls = selectResearchUrls(null, [gapSearch!.value])
          .filter((url) => !urls.includes(url))
          .slice(0, 4);
        const gapPages = (
          await Promise.allSettled(
            gapUrls.map((url) => fetchPage(url, companyNames(company))),
          )
        ).flatMap((result) =>
          result.status === "fulfilled" && result.value.entityMatched
            ? [result.value]
            : [],
        );
        webRefs.push({
          type: "source",
          sourceKey: "Cited public pages: gap_fill",
          status: "succeeded",
          foundCount: gapUrls.length,
          acceptedCount: gapPages.length,
        });
        if (gapPages.length) {
          try {
            const extracted = await extractClaims(
              companyNames(company),
              gapPages,
              eligiblePages.length,
              gaps,
              (metric) =>
                reporter.captureAiCall("claim_extraction:gap_fill", metric),
            );
            eligiblePages.push(...gapPages);
            const added = validExtractedClaims(
              extracted.claims.filter((claim) => gaps.includes(claim.category)),
              eligiblePages,
              companyNames(company),
            );
            claims = [...claims, ...added];
            extractedMissingInformation = extracted.missingInformation;
            webRefs.push({
              type: "source",
              sourceKey: "Gemini structured extraction: gap_fill",
              status: "succeeded",
              foundCount: extracted.claims.length,
              acceptedCount: added.length,
              webSearchCallCount: 0,
              inputTokens: extracted.inputTokens,
              outputTokens: extracted.outputTokens,
            });
          } catch (error) {
            webRefs.push({
              type: "source",
              sourceKey: "Gemini structured extraction: gap_fill",
              status: "failed",
              foundCount: 0,
              acceptedCount: 0,
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
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
    if (task.pipeline === "human_review" && !claims.length) {
      throw new Error("No source-backed company claims were extracted.");
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
                : "Gemini Google Search",
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
                  : "Gemini Google Search",
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
        data: {
          currentResearchId: research.id,
          ...(task.pipeline === "human_review" ? { researchStatus: "ready" as const } : {}),
        },
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

      const fitTask = task.pipeline === "legacy"
        ? await enqueueResearchTask(tx, {
            searchRunId: legacySearchRunId,
            candidateId: running.candidate.id,
            parentTaskId: task.id,
            type: "fit_assessment",
            trigger: task.trigger === "userRequest" ? "userRequest" : "searchRun",
            followupPolicy: "automatic",
          })
        : null;

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
        fitTaskId: fitTask && !fitTask.reused ? fitTask.task.id : null,
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
  const task = await prisma.researchTask.findUnique({
    where: { id: taskId },
    select: { candidateId: true, pipeline: true },
  });
  const updated = await prisma.researchTask.updateMany({
    where: { id: taskId, type: "company_research", status: "running" },
    data: {
      status: "failed",
      errorCode: /Gemini 조사 사용량 한도/.test(message) ? "AI_QUOTA_EXHAUSTED" : "SERVICE_UNAVAILABLE",
      errorMessage: message,
      errorRetryable: task?.pipeline === "human_review",
      finishedAt: new Date(),
    },
  });
  if (updated.count && task?.pipeline === "human_review" && task.candidateId) {
    await prisma.candidate.update({
      where: { id: task.candidateId },
      data: { researchStatus: "error" },
    });
  }
}

export async function queuedCompanyResearchTaskIds(
  limit = 50,
  pipeline: "legacy" | "human_review" = "legacy",
) {
  const tasks = await prisma.researchTask.findMany({
    where: {
      type: "company_research",
      pipeline,
      status: "queued",
      // 도메인 자동 제외 후보는 조사 비용을 쓰지 않는다. 복원되면 남아 있던 작업이 다시 잡힌다.
      ...(pipeline === "human_review" ? { candidate: { autoExcludedAt: null } } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return tasks.map((task) => task.id);
}
