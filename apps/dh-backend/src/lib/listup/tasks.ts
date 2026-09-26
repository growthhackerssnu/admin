import type { Prisma, ResearchTask, ResearchTaskType } from "@/generated/prisma";
import { ApiError } from "../errors";

// 조사 작업을 만드는 유일한 지점이다. 중복 판정과 (나중의) 워커 통지가 여기 모인다.
//
// 워커는 아직 없다. 다음 단계에서 app/api/inngest/route.ts와 src/inngest/를 추가하고,
// 아래 notifyWorker에서 `listup/task.queued` 이벤트를 발행하면 된다 — 라우트는
// inngest를 직접 import하지 않으므로 그때도 라우트 코드는 바뀌지 않는다.
const WORKER_ENABLED = process.env.LISTUP_WORKER_ENABLED === "true";

async function notifyWorker(_taskId: string) {
  if (!WORKER_ENABLED) return;
  // 다음 단계: inngest.send({ name: "listup/task.queued", data: { task_id: taskId } })
}

type EnqueueInput = {
  searchRunId: string;
  candidateId?: string | null;
  parentTaskId?: string | null;
  type: ResearchTaskType;
  trigger: "initial" | "auto_followup" | "human_request" | "fit_changed";
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
      throw new ApiError("TASK_ALREADY_RUNNING", "같은 종류의 조사가 이미 진행 중입니다.", {
        task_id: active.id,
        type: input.type,
      });
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

  await notifyWorker(task.id);
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
export async function cancelPendingFollowups(tx: Prisma.TransactionClient, candidateId: string) {
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
