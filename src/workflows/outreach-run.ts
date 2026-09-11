import { inngest } from "../inngest/client";
import { prisma } from "../lib/prisma";
import { postCompanyApprovalCards } from "../slack/blocks/companyApprovalCard";

/**
 * Phase 1 스켈레톤: 이 프로젝트에서 가장 리스크가 큰 인프라 가정 —
 * "Slack 승인을 최대 며칠간 기다리는 동안 정지했다가, 인간이 버튼을 누르면
 * 정확히 그 지점부터 재개된다" — 를 실제 소싱/리서치 로직 없이 먼저 검증한다.
 *
 * 흐름: RUN_COMPANY 후보를 불러와 Slack에 승인 카드 게시 → 최대 3일간 대기 →
 * "제출 완료" 버튼으로 발행되는 배치 이벤트가 오면 재개 → 다음 단계로 상태만 전환.
 * 실제 소싱 파이프라인(규칙기반 필터+LLM 평가)은 Phase 2에서 이 함수 앞단에 연결한다.
 */
export const outreachRun = inngest.createFunction(
  { id: "outreach-run", name: "Outreach Run" },
  { event: "dhbot/run.sourcing.requested" },
  async ({ event, step }) => {
    const { runId } = event.data;

    await step.run("mark-sourcing", async () => {
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "SOURCING" },
      });
    });

    const candidates = await step.run("load-run-companies", async () => {
      return prisma.runCompany.findMany({
        where: { runId },
        include: { company: true },
      });
    });

    if (candidates.length === 0) {
      await step.run("mark-failed-no-candidates", async () => {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "FAILED", completedAt: new Date() },
        });
      });
      return { status: "failed", reason: "no_candidates" };
    }

    await step.run("post-company-approval-cards", async () => {
      await postCompanyApprovalCards(runId, candidates);
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "AWAITING_COMPANY_APPROVAL" },
      });
    });

    const decisionEvent = await step.waitForEvent("wait-for-company-decisions", {
      event: "dhbot/company.decision.batch",
      timeout: "3d",
      match: "data.runId",
    });

    if (!decisionEvent) {
      await step.run("mark-timed-out", async () => {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "FAILED", completedAt: new Date() },
        });
      });
      return { status: "timed_out" };
    }

    const approvedCount = await step.run("count-approved", async () => {
      return prisma.runCompany.count({
        where: { runId, status: "APPROVED" },
      });
    });

    await step.run("advance-status", async () => {
      const nextStatus = approvedCount > 0 ? "RESEARCHING_CONTACTS" : "COMPLETED";
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: nextStatus,
          completedAt: approvedCount > 0 ? null : new Date(),
        },
      });
    });

    // Phase 3에서 여기에 상세 리서치+담당자 발굴 이벤트 발행을 연결한다.
    return { status: "companies_decided", approvedCount };
  },
);
