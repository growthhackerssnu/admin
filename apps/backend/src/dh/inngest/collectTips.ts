import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeCollectedName } from "./startupRecipe";
import {
  TIPS_API_BASE,
  TIPS_FILTERS_URL,
  TIPS_PAGE_SIZE,
  TIPS_PARSER_VERSION,
  parseTipsFiltersResponse,
  parseTipsListResponse,
  tipsListUrl,
  toTipsCompany,
  type TipsCompany,
  type TipsFilterMap,
} from "./tips";

const SOURCE_KEY = "tips";
// 오늘 기준 4,588개 / size 100 ≈ 46페이지. 이름순 정렬 중 전체 개수가 틀어져도
// 무한 루프에 빠지지 않도록 넉넉한 상한만 둔다 — 실제 멈추는 지점은 API가 돌려주는 total이다.
const MAX_PAGES = 60;

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "dhbot-collection/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TIPS HTTP ${response.status}: ${url}`);
  return response.text();
}

async function persistCompany(input: {
  sourceId: string;
  itemId: string;
  runId: string;
  company: TipsCompany;
}) {
  const { sourceId, itemId, runId, company } = input;
  const normalizedName = normalizeCollectedName(company.name);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.companyNameKey.findUnique({
      where: { sourceId_normalizedName: { sourceId, normalizedName } },
      include: { company: { include: { candidates: { select: { id: true }, take: 1 } } } },
    });
    const priorCompany = existing?.company ?? await tx.company.findFirst({
      where: { name: { equals: company.name, mode: "insensitive" } },
      include: { candidates: { select: { id: true }, take: 1 } },
      orderBy: { createdAt: "asc" },
    });
    const target = priorCompany ?? await tx.company.create({ data: { name: company.name } });
    if (!existing) {
      await tx.companyNameKey.create({
        data: { sourceId, normalizedName, companyId: target.id },
      });
    }
    const collected = await tx.collectedCompany.upsert({
      where: { itemId_normalizedName: { itemId, normalizedName } },
      create: {
        itemId,
        name: company.name,
        normalizedName,
        summary: company.summary,
        companyId: target.id,
        candidateId: priorCompany?.candidates[0]?.id,
        result: priorCompany ? "duplicate" : "created",
      },
      update: {},
    });
    if (priorCompany) return { created: false, candidateId: priorCompany.candidates[0]?.id ?? null };

    const evidence = await tx.evidence.create({
      data: {
        companyId: target.id,
        searchRunId: runId,
        url: company.detailUrl,
        sourceKey: "TIPS",
        title: company.name,
        excerpt: `${company.name} | ${company.summary}`,
        publishedAt: null,
      },
    });
    const candidate = await tx.candidate.create({
      data: {
        companyId: target.id,
        originSearchRunId: runId,
        originCollectedCompanyId: collected.id,
        discoveryEvidenceIds: [evidence.id],
        researchStatus: "queued",
        reviewStatus: "unreviewed",
      },
    });
    await tx.collectedCompany.update({
      where: { id: collected.id },
      data: { candidateId: candidate.id },
    });
    await tx.researchTask.create({
      data: {
        candidateId: candidate.id,
        searchRunId: runId,
        type: "company_research",
        pipeline: "human_review",
        trigger: "cron",
        requestedInformation: [],
        status: "queued",
      },
    });
    return { created: true, candidateId: candidate.id };
  });
}

async function processPage(input: {
  sourceId: string;
  runId: string;
  page: number;
  filters: TipsFilterMap;
}) {
  const { sourceId, runId, page, filters } = input;
  const url = tipsListUrl(page, TIPS_PAGE_SIZE);
  const raw = await fetchText(url);
  const { records, total } = parseTipsListResponse(JSON.parse(raw));
  const externalKey = `page-${page}`;

  const item = await prisma.collectionItem.upsert({
    where: { sourceId_externalKey: { sourceId, externalKey } },
    create: {
      sourceId,
      firstRunId: runId,
      externalKey,
      url,
      title: `TIPS 창업기업 목록 p${page}`,
      publishedAt: null,
      contentHash: createHash("sha256").update(raw).digest("hex"),
      parserVersion: TIPS_PARSER_VERSION,
    },
    update: {},
  });
  const leaseToken = randomUUID();
  const claimed = await prisma.collectionItem.updateMany({
    where: {
      id: item.id,
      OR: [
        { status: { in: ["pending", "failed"] } },
        { status: "processing", leaseUntil: { lt: new Date() } },
      ],
    },
    data: {
      status: "processing",
      attempt: { increment: 1 },
      leaseToken,
      leaseUntil: new Date(Date.now() + 10 * 60_000),
      errorCode: null,
      errorMessage: null,
      retryable: null,
    },
  });
  if (!claimed.count) return { skipped: true, created: 0, total };

  try {
    let created = 0;
    for (const record of records) {
      const company = toTipsCompany(record, filters);
      const result = await persistCompany({ sourceId, itemId: item.id, runId, company });
      if (result.created) created += 1;
    }
    await prisma.collectionItem.updateMany({
      where: { id: item.id, leaseToken },
      data: { status: "completed", extractedAt: new Date(), leaseToken: null, leaseUntil: null },
    });
    return { skipped: false, created, total };
  } catch (error) {
    await prisma.collectionItem.updateMany({
      where: { id: item.id, leaseToken },
      data: {
        status: "failed",
        errorCode: "EXTRACTION_FAILED",
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        retryable: true,
        leaseToken: null,
        leaseUntil: null,
      },
    });
    throw error;
  }
}

export async function collectTips(options: { maxPages?: number } = {}) {
  if (process.env.HUMAN_REVIEW_PIPELINE_ENABLED !== "true") return { disabled: true };
  const intake = await prisma.collectionIntakeControl.findUnique({ where: { id: "dh" } });
  if (intake?.paused) return { paused: true };
  const source = await prisma.collectionSource.upsert({
    where: { key: SOURCE_KEY },
    create: {
      key: SOURCE_KEY,
      name: "TIPS",
      kind: "public_api",
      config: { apiBase: TIPS_API_BASE },
      parserVersion: TIPS_PARSER_VERSION,
    },
    update: {},
  });
  if (!source.enabled) return { sourceDisabled: true };

  const now = new Date();
  const scheduledFor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const run = await prisma.searchRun.upsert({
    where: { sourceId_scheduledFor: { sourceId: source.id, scheduledFor } },
    create: {
      sourceId: source.id,
      scheduledFor,
      status: "running",
      startedAt: now,
      conditionsSnapshot: { source: SOURCE_KEY, parserVersion: TIPS_PARSER_VERSION },
    },
    update: {},
  });

  try {
    const filters = parseTipsFiltersResponse(JSON.parse(await fetchText(TIPS_FILTERS_URL)));
    const maxPages = options.maxPages ?? MAX_PAGES;
    let created = 0;
    let failed = 0;
    let pageCount = 0;
    let total = Number.POSITIVE_INFINITY;
    for (let page = 1; page <= maxPages && (page - 1) * TIPS_PAGE_SIZE < total; page += 1) {
      pageCount += 1;
      try {
        const result = await processPage({ sourceId: source.id, runId: run.id, page, filters });
        created += result.created;
        total = result.total;
      } catch (error) {
        failed += 1;
        console.error("TIPS page collection failed", { page, error });
      }
    }
    await prisma.searchRun.update({
      where: { id: run.id },
      data: {
        status: failed ? "partially_completed" : "completed",
        finishReason: failed ? `${failed} page(s) failed` : null,
        finishedAt: new Date(),
      },
    });
    return { pageCount, candidateCount: created, failedPageCount: failed };
  } catch (error) {
    await prisma.searchRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishReason: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
