import type { Prisma, SearchRunStatus } from "@/generated/prisma";
import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { listBody, successBody } from "@/lib/listup/errors";
import { withIdempotency } from "@/lib/idempotency";
import { invalidSourceEntryUrl, isSourceAvailable, isSupportedSourceKey, sourceUnavailableReason } from "@/lib/listup/sources";
import { serializeResearchTask, serializeSearchRun } from "@/lib/listup/serializers";
import { enqueueResearchTask } from "@/lib/listup/tasks";
import { notifyWorker } from "@/inngest/client";
import { createSearchRunSchema } from "@/lib/listup/validation";
import { buildPage, parseCursor, parseLimit, takeWithLookahead } from "@/lib/pagination";
import {
  LISTUP_EXECUTION_VERSION,
  createListupExecution,
  type ConditionsSnapshot,
} from "@/config/listupExecution";
import { getFitCriteriaSnapshot } from "@/config/fitCriteria";
import { prisma } from "@/lib/prisma";

const runInclude = {
  createdBy: { select: { id: true, displayName: true } },
  assignedMember: { select: { id: true, displayName: true } },
  targetQuarter: true,
} satisfies Prisma.SearchRunInclude;

const SEARCH_RUN_STATUSES: SearchRunStatus[] = [
  "queued",
  "running",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
];

// GET /search-runs?targetQuarterId&assignedMemberId&status&cursor&limit
export const GET = withListupApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams);
  const cursor = parseCursor(searchParams);
  const status = searchParams.get("status");
  const targetQuarterId = searchParams.get("targetQuarterId");
  const assignedMemberId = searchParams.get("assignedMemberId");

  if (status && !SEARCH_RUN_STATUSES.includes(status as SearchRunStatus)) {
    throw new ApiError("VALIDATION_ERROR", "status 값이 올바르지 않습니다.", { fieldErrors: { status: "허용되지 않는 값" } });
  }

  const rows = await prisma.searchRun.findMany({
    where: {
      ...(status ? { status: status as SearchRunStatus } : {}),
      ...(targetQuarterId ? { targetQuarterId } : {}),
      ...(assignedMemberId ? { assignedMemberId } : {}),
    },
    take: takeWithLookahead(limit),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: runInclude,
  });

  const { items, nextCursor, hasMore } = buildPage(rows, limit);
  return { body: listBody(items.map(serializeSearchRun), { nextCursor, hasMore }) };
});

// 담당자 검사가 없는 것은 의도적이다: 새로 만드는 동작이라 대조할 담당자가 아직 없고,
// 로그인한 팀원이면 누구나 탐색을 시작할 수 있다(P-02). 시작한 사람이 그대로 담당자가
// 되며, 그 뒤의 변경부터 P-23이 적용된다.
// POST /search-runs — 탐색 조건을 저장하고 최초 company_discovery 작업을 만든다.
// 실제 수집은 워커의 몫이라 여기서는 접수만 하고 202를 돌려준다.
export const POST = withListupApiHandler(async (req, { member }) => {
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
  const unavailable = input.sources.filter((source) => !isSourceAvailable(source.key));
  if (unavailable.length > 0) {
    throw new ApiError("UNSUPPORTED_SOURCE", "현재 사용할 수 없는 탐색 소스입니다.", {
      fieldErrors: {
        sources: unavailable.map((source) => sourceUnavailableReason(source.key) ?? source.key).join(" "),
      },
    });
  }
  const invalidEntryUrls = input.sources.flatMap((source) =>
    source.entryUrls
      .map((url) => invalidSourceEntryUrl(source.key, url))
      .filter((message): message is string => Boolean(message)),
  );
  if (invalidEntryUrls.length > 0) {
    throw new ApiError("VALIDATION_ERROR", "소스 직접 URL을 확인해주세요.", {
      fieldErrors: { sources: invalidEntryUrls.join(" ") },
    });
  }

  const result = await withIdempotency(req, member, "POST /search-runs", input, async (tx) => {
    const quarter = await tx.targetQuarter.findUnique({ where: { id: input.targetQuarterId } });
    if (!quarter) throw new ApiError("NOT_FOUND", "목표 분기를 찾을 수 없습니다.");

    // 실행 설정은 요청 본문이 아니라 서버 config에서 읽어 스냅샷으로 얼려둔다(v0.4 §6.4).
    // 나중에 config를 바꿔도 이 배치가 어떤 상한으로 돌았는지는 남는다.
    const conditionsSnapshot: ConditionsSnapshot = {
      schemaVersion: LISTUP_EXECUTION_VERSION,
      // 기준은 코드의 시스템 프롬프트로 관리하되, 이 배치가 실제 사용한 원문을 고정한다.
      fitCriteria: getFitCriteriaSnapshot(),
      sources: input.sources,
      filters: input.filters,
      execution: createListupExecution(input.maxCompanies),
    };

    const run = await tx.searchRun.create({
      data: {
        targetQuarterId: input.targetQuarterId,
        conditionsSnapshot,
        // 탐색을 시작한 사람이 결과 기업의 첫 전송까지 담당한다(P-02).
        createdById: member.id,
        assignedMemberId: member.id,
      },
      include: runInclude,
    });

    const { task } = await enqueueResearchTask(tx, {
      searchRunId: run.id,
      type: "company_discovery",
      trigger: "searchRun",
      followupPolicy: "automatic",
    });

    return {
      status: 202,
      body: successBody({
        searchRun: serializeSearchRun(run),
        initialTask: serializeResearchTask(task),
      }),
    };
  });

  const taskId = (result.body as { data: { initialTask: { id: string } } }).data.initialTask.id;
  await notifyWorker(taskId);

  return {
    ...result,
    headers: { Location: `/api/v1/search-runs/${(result.body as { data: { searchRun: { id: string } } }).data.searchRun.id}` },
  };
});
