import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  STARTUP_RECIPE_ARCHIVE,
  STARTUP_RECIPE_PARSER_VERSION,
  nextStartupRecipeArchiveUrl,
  normalizeCollectedName,
  parseStartupRecipeArticle,
  startupRecipeArticleUrls,
  type StartupRecipeCompany,
} from "./startupRecipe";

const SOURCE_KEY = "startup-recipe";
const MAX_ARCHIVE_PAGES = 12;
const LOOKBACK_DAYS = 84;

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "dhbot-collection/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`StartupRecipe HTTP ${response.status}: ${url}`);
  return response.text();
}

async function articleUrls(maxArchivePages: number) {
  const found = new Set<string>();
  const visited = new Set<string>();
  let pageUrl: string | null = STARTUP_RECIPE_ARCHIVE;
  for (let page = 0; page < maxArchivePages && pageUrl; page += 1) {
    if (visited.has(pageUrl)) break;
    visited.add(pageUrl);
    const html = await fetchHtml(pageUrl);
    startupRecipeArticleUrls(html, pageUrl).forEach((url) => found.add(url));
    pageUrl = nextStartupRecipeArchiveUrl(html, pageUrl);
  }
  return [...found];
}

async function persistCompany(input: {
  sourceId: string;
  itemId: string;
  runId: string;
  url: string;
  title: string;
  publishedAt: Date | null;
  company: StartupRecipeCompany;
}) {
  const { sourceId, itemId, runId, url, title, publishedAt, company } = input;
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
        url,
        sourceKey: "StartupRecipe",
        title,
        excerpt: `${company.name} | ${company.summary}`,
        publishedAt,
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

async function processArticle(input: {
  sourceId: string;
  runId: string;
  url: string;
  cutoff: Date;
}) {
  const { sourceId, runId, url, cutoff } = input;
  const html = await fetchHtml(url);
  const parsed = parseStartupRecipeArticle(html);
  if (!parsed.weekly || (parsed.publishedAt && parsed.publishedAt < cutoff))
    return { skipped: true, created: 0 };

  const item = await prisma.collectionItem.upsert({
    where: { sourceId_externalKey: { sourceId, externalKey: url } },
    create: {
      sourceId,
      firstRunId: runId,
      externalKey: url,
      url,
      title: parsed.title,
      publishedAt: parsed.publishedAt,
      contentHash: createHash("sha256").update(html).digest("hex"),
      parserVersion: STARTUP_RECIPE_PARSER_VERSION,
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
  if (!claimed.count) return { skipped: true, created: 0 };

  try {
    let created = 0;
    for (const company of parsed.companies) {
      const result = await persistCompany({
        sourceId,
        itemId: item.id,
        runId,
        url,
        title: parsed.title,
        publishedAt: parsed.publishedAt,
        company,
      });
      if (result.created) created += 1;
    }
    await prisma.collectionItem.updateMany({
      where: { id: item.id, leaseToken },
      data: {
        status: "completed",
        extractedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
      },
    });
    return { skipped: false, created };
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

export async function collectStartupRecipe(options: { maxArchivePages?: number; maxArticles?: number } = {}) {
  if (process.env.HUMAN_REVIEW_PIPELINE_ENABLED !== "true") return { disabled: true };
  const intake = await prisma.collectionIntakeControl.findUnique({ where: { id: "dh" } });
  if (intake?.paused) return { paused: true };
  const source = await prisma.collectionSource.upsert({
    where: { key: SOURCE_KEY },
    create: {
      key: SOURCE_KEY,
      name: "StartupRecipe",
      kind: "web_archive",
      config: { archiveUrl: STARTUP_RECIPE_ARCHIVE },
      parserVersion: STARTUP_RECIPE_PARSER_VERSION,
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
      conditionsSnapshot: { source: SOURCE_KEY, parserVersion: STARTUP_RECIPE_PARSER_VERSION },
    },
    update: {},
  });
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  try {
    const urls = (await articleUrls(options.maxArchivePages ?? MAX_ARCHIVE_PAGES))
      .slice(0, options.maxArticles ?? Number.POSITIVE_INFINITY);
    let created = 0;
    let failed = 0;
    for (const url of urls) {
      try {
        const result = await processArticle({ sourceId: source.id, runId: run.id, url, cutoff });
        created += result.created;
      } catch (error) {
        failed += 1;
        console.error("StartupRecipe article collection failed", { url, error });
      }
    }
    await prisma.searchRun.update({
      where: { id: run.id },
      data: {
        status: failed ? "partially_completed" : "completed",
        finishReason: failed ? `${failed} article(s) failed` : null,
        finishedAt: new Date(),
      },
    });
    return { articleCount: urls.length, candidateCount: created, failedArticleCount: failed };
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
