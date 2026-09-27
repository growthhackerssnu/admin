import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma";
import { decisionSourceOf, recomputeCandidateState } from "./state";

// 명세 §4.1(연락 상태 우선순위)과 §3.5(effective_fit 산출)는 이 워크플로에서 가장
// 많이 읽히는 파생값이라, DB 없이 표로 전부 돌린다.

type Scenario = {
  candidate?: Partial<{
    activeHumanDecisionId: string | null;
    latestSystemAssessmentId: string | null;
    effectiveFit: "fit" | "unfit" | "pending" | null;
    contactResearchStatus: string;
    usableContactCount: number;
    needsVerificationContactCount: number;
    unusableContactCount: number;
  }>;
  humanVerdict?: "fit" | "unfit" | "pending";
  systemVerdict?: "fit" | "unfit" | "pending";
  contacts?: { status: "usable" | "needs_verification" | "unusable"; count: number }[];
  activeContactTask?: boolean;
  succeededContactResearch?: boolean;
};

function fakeTx(scenario: Scenario) {
  const updates: Record<string, unknown>[] = [];
  const tx = {
    candidate: {
      findUnique: async () => ({
        id: "cand1",
        activeHumanDecisionId: scenario.humanVerdict ? "dec1" : null,
        latestSystemAssessmentId: scenario.systemVerdict ? "assess1" : null,
        effectiveFit: scenario.candidate?.effectiveFit ?? null,
        contactResearchStatus: scenario.candidate?.contactResearchStatus ?? "not_started",
        usableContactCount: scenario.candidate?.usableContactCount ?? 0,
        needsVerificationContactCount: scenario.candidate?.needsVerificationContactCount ?? 0,
        unusableContactCount: scenario.candidate?.unusableContactCount ?? 0,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "cand1", ...data };
      },
    },
    humanFitDecision: {
      findUnique: async () => (scenario.humanVerdict ? { verdict: scenario.humanVerdict } : null),
    },
    fitAssessment: {
      findUnique: async () => (scenario.systemVerdict ? { verdict: scenario.systemVerdict } : null),
    },
    contactOptionAssessment: {
      groupBy: async () =>
        (scenario.contacts ?? []).map((c) => ({ status: c.status, _count: { _all: c.count } })),
    },
    researchTask: {
      findFirst: async ({ where }: { where: { status?: unknown; type?: unknown } }) => {
        // 활성 작업 조회는 status가 목록, 성공한 조사 조회는 status가 단일 값이다.
        const isActiveQuery = typeof where.status === "object";
        if (isActiveQuery) return scenario.activeContactTask ? { id: "task1" } : null;
        return scenario.succeededContactResearch ? { id: "task2" } : null;
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, updates };
}

async function runState(scenario: Scenario) {
  const { tx, updates } = fakeTx(scenario);
  await recomputeCandidateState(tx, "cand1");
  return updates[0]!;
}

describe("effective_fit 산출", () => {
  it("사람 판단이 있으면 시스템 판단보다 우선한다", async () => {
    const data = await runState({ humanVerdict: "fit", systemVerdict: "unfit" });
    expect(data.effectiveFit).toBe("fit");
  });

  it("사람 판단이 없으면 최신 시스템 판단을 쓴다", async () => {
    const data = await runState({ systemVerdict: "pending" });
    expect(data.effectiveFit).toBe("pending");
  });

  it("둘 다 없으면 null이다 — wire에서 not_assessed로 나간다", async () => {
    const data = await runState({});
    expect(data.effectiveFit).toBeNull();
  });
});

describe("contact_status 우선순위 (명세 §4.1)", () => {
  it("usable 창구가 하나라도 있으면 available — 활성 작업이 있어도 마찬가지다", async () => {
    const data = await runState({
      contacts: [{ status: "usable", count: 1 }],
      activeContactTask: true,
    });
    expect(data.contactResearchStatus).toBe("available");
  });

  it("usable이 없고 연락 조사가 진행 중이면 searching", async () => {
    const data = await runState({
      contacts: [{ status: "needs_verification", count: 2 }],
      activeContactTask: true,
    });
    expect(data.contactResearchStatus).toBe("searching");
  });

  it("활성 작업이 없고 needs_verification이 있으면 needs_verification", async () => {
    const data = await runState({ contacts: [{ status: "needs_verification", count: 1 }] });
    expect(data.contactResearchStatus).toBe("needs_verification");
  });

  it("정상 종료한 연락 조사가 있고 쓸 창구가 없으면 not_found", async () => {
    const data = await runState({
      contacts: [{ status: "unusable", count: 3 }],
      succeededContactResearch: true,
    });
    expect(data.contactResearchStatus).toBe("not_found");
  });

  it("아무 조건도 만족하지 않으면 not_started", async () => {
    const data = await runState({});
    expect(data.contactResearchStatus).toBe("not_started");
  });

  it("조사가 실패하기만 한 경우도 not_started다 — 미발견과 실패를 구분한다", async () => {
    const data = await runState({ succeededContactResearch: false });
    expect(data.contactResearchStatus).toBe("not_started");
  });
});

describe("revision", () => {
  it("보이는 상태가 바뀌면 올린다", async () => {
    const data = await runState({ systemVerdict: "fit" });
    expect(data.revision).toEqual({ increment: 1 });
  });

  it("아무것도 안 바뀌면 올리지 않는다", async () => {
    const data = await runState({
      candidate: { effectiveFit: null, contactResearchStatus: "not_started" },
    });
    expect(data.revision).toBeUndefined();
  });
});

describe("decisionSourceOf", () => {
  it("활성 사람 판단 → human, 시스템 판단만 → system, 둘 다 없으면 none", () => {
    expect(decisionSourceOf({ activeHumanDecisionId: "d", latestSystemAssessmentId: "a" })).toBe("human");
    expect(decisionSourceOf({ activeHumanDecisionId: null, latestSystemAssessmentId: "a" })).toBe("system");
    expect(decisionSourceOf({ activeHumanDecisionId: null, latestSystemAssessmentId: null })).toBe("none");
  });
});
