import type {
  Prisma,
  ResearchTask,
  ResearchTaskTrigger,
  ResearchTaskType,
} from "@/generated/prisma";
import { ApiError } from "../errors";

// 조사 작업을 만드는 유일한 지점이다. 중복 판정과 (나중의) 워커 통지가 여기 모인다.
//
// This module owns transactional task creation only. The caller publishes an
// Inngest event after its transaction commits.
type EnqueueInput = {
  searchRunId: string;
  candidateId?: string | null;
  parentTaskId?: string | null;
  type: ResearchTaskType;
  // v0.4 §6.7: 배치가 만든 작업(searchRun)과 사람이 요청한 작업(userRequest)만 구분한다.
  trigger: ResearchTaskTrigger;
  requestedInformation?: string[];
  followupPolicy: "automatic" | "none";
};

function sameRequest(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

// 같은 후보·같은 유형의 작업이 이미 실행 중이면 새로 만들지 않는다(명세 §3.11).
// 요청 내용까지 같으면 그 작업을 그대로 돌려주고, 내용이 다르면 충돌로 거절한다 —
// 먼저 돌던 조사가 끝나기 전에 다른 질문을 덮어쓰지 않기 위해서다.
export async function enqueueResearchTask(
  tx: Prisma.TransactionClient,
  input: EnqueueInput,
): Promise<{ task: ResearchTask; reused: boolean }> {
  const requestedInformation = input.requestedInformation ?? [];

  if (input.candidateId) {
    const active = await tx.researchTask.findFirst({
      where: {
        candidateId: input.candidateId,
        type: input.type,
        status: { in: ["queued", "running"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (active) {
      if (sameRequest(active.requestedInformation, requestedInformation)) {
        return { task: active, reused: true };
      }
      throw new ApiError(
        "TASK_ALREADY_RUNNING",
        "같은 종류의 조사가 이미 진행 중입니다.",
        {
          fieldErrors: { type: input.type },
        },
      );
    }
  }

  const task = await tx.researchTask.create({
    data: {
      searchRunId: input.searchRunId,
      candidateId: input.candidateId ?? null,
      parentTaskId: input.parentTaskId ?? null,
      type: input.type,
      trigger: input.trigger,
      requestedInformation,
      followupPolicy: input.followupPolicy,
    },
  });

  return { task, reused: false };
}

// 후보별 연락 조사 라운드 사용량. 기술적 재시도(attempt)와는 다른 축이다 —
// 자동 한도는 "몇 번 더 찾아봤는가"를 세고, 재시도는 같은 작업의 재실행이다.
export async function countAutomaticContactRounds(
  tx: Prisma.TransactionClient,
  candidateId: string,
): Promise<number> {
  return tx.researchTask.count({
    where: {
      candidateId,
      type: "contact_research",
      trigger: { in: ["initial", "auto_followup", "fit_changed"] },
    },
  });
}

// 후보가 부적합·보류로 바뀌면 대기 중인 자동 후속 작업을 취소한다. 실행 중인 작업은
// 여기서 멈출 수 없으므로(워커가 없다) 상태만 남기고, 워커가 생기면 단계 사이에서
// 협조적으로 확인하게 한다.
export async function cancelPendingFollowups(
  tx: Prisma.TransactionClient,
  candidateId: string,
) {
  await tx.researchTask.updateMany({
    where: {
      candidateId,
      status: "queued",
      followupPolicy: "automatic",
      type: { in: ["contact_research", "contact_verification"] },
    },
    data: { status: "cancelled", finishedAt: new Date() },
  });
}

export type FitFollowupResult = {
  action: "task_created" | "task_reused" | "contacts_reused" | "none";
  taskId: string | null;
  reason:
    | "fit_changed"
    | "existing_task"
    | "existing_contacts"
    | "automatic_limit_reached"
    | "not_fit";
};

// Human and system fit decisions use the same contact follow-up rules. Keeping
// them here prevents the two paths from creating different queued work.
export async function applyFitFollowup(
  tx: Prisma.TransactionClient,
  input: {
    candidateId: string;
    searchRunId: string;
    verdict: "fit" | "unfit" | "pending";
    usableContactCount: number;
    maxContactSearchRounds: number;
  },
): Promise<FitFollowupResult> {
  if (input.verdict !== "fit") {
    await cancelPendingFollowups(tx, input.candidateId);
    return { action: "none", taskId: null, reason: "not_fit" };
  }

  if (input.usableContactCount > 0) {
    return {
      action: "contacts_reused",
      taskId: null,
      reason: "existing_contacts",
    };
  }

  const activeContactTask = await tx.researchTask.findFirst({
    where: {
      candidateId: input.candidateId,
      type: { in: ["contact_research", "contact_verification"] },
      status: { in: ["queued", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (activeContactTask) {
    return {
      action: "task_reused",
      taskId: activeContactTask.id,
      reason: "existing_task",
    };
  }

  const usedRounds = await countAutomaticContactRounds(tx, input.candidateId);
  if (usedRounds >= input.maxContactSearchRounds) {
    return { action: "none", taskId: null, reason: "automatic_limit_reached" };
  }

  const { task, reused } = await enqueueResearchTask(tx, {
    searchRunId: input.searchRunId,
    candidateId: input.candidateId,
    type: "contact_research",
    trigger: "fit_changed",
    requestedInformation: [
      "contact_search_round:1",
      "contact_strategy:executive",
    ],
    followupPolicy: "automatic",
  });
  return {
    action: reused ? "task_reused" : "task_created",
    taskId: task.id,
    reason: reused ? "existing_task" : "fit_changed",
  };
}
