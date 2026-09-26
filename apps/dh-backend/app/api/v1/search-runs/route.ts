import type { Prisma, SearchRunStatus } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, fieldErrorsOf, listBody, successBody } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { isSupportedSourceKey } from "@/lib/listup/sources";
import { serializeResearchTask, serializeSearchRun } from "@/lib/listup/serializers";
import { enqueueResearchTask } from "@/lib/listup/tasks";
import { createSearchRunSchema } from "@/lib/listup/validation";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const runInclude = {
  createdBy: { select: { id: true, displayName: true } },
  quarter: { select: { id: true, label: true } },
} satisfies Prisma.SearchRunInclude;

const SEARCH_RUN_STATUSES: SearchRunStatus[] = [
  "queued",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
];

// GET /search-runs?status&quarter_id&cursor&limit
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const status = searchParams.get("status");
  const quarterId = searchParams.get("quarterId");

  if (status && !SEARCH_RUN_STATUSES.includes(status as SearchRunStatus)) {
    throw new ApiError("VALIDATION_ERROR", "status 값이 올바르지 않습니다.", { fieldErrors: { status: "허용되지 않는 값" } });
  }

  const rows = await prisma.searchRun.findMany({
    where: {
      ...(status ? { status: status as SearchRunStatus } : {}),
      ...(quarterId ? { quarterId } : {}),
    },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: runInclude,
  });

  const { items, nextCursor } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeSearchRun), nextCursor) };
});

// POST /search-runs — 탐색 조건을 저장하고 최초 company_discovery 작업을 만든다.
// 실제 수집은 워커의 몫이라 여기서는 접수만 하고 202를 돌려준다.
export const POST = withApiHandler(async (req, { member }) => {
  const body = await req.json().catch(() => null);
  const parsed = createSearchRunSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", {
      fieldErrors: fieldErrorsOf(parsed.error.flatten().fieldErrors),
    });
  }
  const input = parsed.data;

  const unsupported = input.sources.map((s) => s.key).filter((key) => !isSupportedSourceKey(key));
  if (unsupported.length > 0) {
    throw new ApiError("UNSUPPORTED_SOURCE", "지원하지 않는 탐색 소스입니다.", { fieldErrors: { sources: unsupported.join(", ") } });
  }

  return withIdempotency(req, member, "POST /search-runs", input, async (tx) => {
    const quarter = await tx.quarter.findUnique({ where: { id: input.quarterId } });
    if (!quarter) throw new ApiError("NOT_FOUND", "분기를 찾을 수 없습니다.");
    if (!quarter.active) {
      throw new ApiError("INVALID_STATE", "닫힌 분기에는 새 탐색을 만들 수 없습니다.", {
        fieldErrors: { quarterId: "닫힌 분기" },
      });
    }

    const run = await tx.searchRun.create({
      data: {
        quarterId: input.quarterId,
        sourcePolicy: input.sourcePolicy,
        sources: input.sources,
        filters: input.filters,
        limits: input.limits,
        createdById: member.id,
      },
      include: runInclude,
    });

    const { task } = await enqueueResearchTask(tx, {
      searchRunId: run.id,
      type: "company_discovery",
      trigger: "initial",
      followupPolicy: "automatic",
    });

    return {
      status: 202,
      body: successBody({
        searchRun: serializeSearchRun(run),
        initialTask: serializeResearchTask(task),
      }),
    };
  }).then((result) => ({
    ...result,
    headers: { Location: `/api/v1/search-runs/${(result.body as { data: { searchRun: { id: string } } }).data.searchRun.id}` },
  }));
});
