import { inngest } from "../inngest/client";
import { prisma } from "../lib/prisma";
import { postCompanyApprovalCards } from "../slack/blocks/companyApprovalCard";
import { runSourcingPipeline } from "../modules/sourcing/pipeline";

/**
 * 흐름: (후보가 아직 없다면) 실제 소싱 파이프라인으로 RUN_COMPANY 후보를 채움 →
 * Slack에 승인 카드 게시 → 최대 3일간 대기(Phase 1에서 검증한 정지/재개 지점) →
 * "제출 완료" 버튼으로 발행되는 배치 이벤트가 오면 재개 → 다음 단계로 상태만 전환.
 *
 * `/dhbot-run-test`처럼 RUN_COMPANY를 미리 심어둔 더미 실행은 소싱 단계를 건너뛴다
 * (더미 데이터 위에 실제 소싱 결과가 중복으로 얹히는 것을 방지).
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

    const existingCandidateCount = await step.run("count-existing-run-companies", () =>
      prisma.runCompany.count({ where: { runId } }),
    );

    if (existingCandidateCount === 0) {
      await runSourcingPipeline(runId, step);
    }

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
