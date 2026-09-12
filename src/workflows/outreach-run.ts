import { inngest } from "../inngest/client";
import { prisma } from "../lib/prisma";
import { postCompanyApprovalCards } from "../slack/blocks/companyApprovalCard";
import { postContactApprovalCards } from "../slack/blocks/contactApprovalCard";
import { runSourcingPipeline } from "../modules/sourcing/pipeline";
import { researchAndPersistContacts } from "../modules/contacts/persistContacts";

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

    await step.run("mark-researching-contacts", async () => {
      const nextStatus = approvedCount > 0 ? "RESEARCHING_CONTACTS" : "COMPLETED";
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: nextStatus,
          completedAt: approvedCount > 0 ? null : new Date(),
        },
      });
    });

    if (approvedCount === 0) {
      return { status: "companies_decided", approvedCount };
    }

    const approvedCompanies = await step.run("load-approved-companies", () =>
      prisma.runCompany.findMany({
        where: { runId, status: "APPROVED" },
        include: { company: true },
      }),
    );

    // 담당자 발굴은 회사마다 Claude+web_search 호출(최대 6회)이 들어가 시간이 걸리므로,
    // 소싱과 마찬가지로 회사별로 별도 step으로 쪼갠다(Vercel 함수 1회 호출 제한 회피).
    for (const rc of approvedCompanies) {
      await step.run(`discover-contacts-${rc.id}`, () => researchAndPersistContacts(rc.id));
    }

    const runCompaniesWithCandidates = await step.run("load-contact-candidates", () =>
      prisma.runCompany.findMany({
        where: { id: { in: approvedCompanies.map((rc) => rc.id) } },
        include: {
          company: true,
          researchAttempts: {
            where: { stage: "CONTACT_DISCOVERY" },
            orderBy: { attemptNo: "desc" },
            take: 1,
            include: { contactCandidates: { include: { contact: { include: { contactMethods: true } } } } },
          },
        },
      }),
    );

    await step.run("post-contact-approval-cards", async () => {
      const cards = runCompaniesWithCandidates.map((rc) => ({
        id: rc.id,
        company: rc.company,
        contactCandidates: rc.researchAttempts[0]?.contactCandidates ?? [],
      }));
      await postContactApprovalCards(runId, cards);
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { status: "AWAITING_CONTACT_APPROVAL" },
      });
    });

    const contactDecisionEvent = await step.waitForEvent("wait-for-contact-decisions", {
      event: "dhbot/contact.decision.batch",
      timeout: "3d",
      match: "data.runId",
    });

    if (!contactDecisionEvent) {
      await step.run("mark-contact-timed-out", async () => {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "FAILED", completedAt: new Date() },
        });
      });
      return { status: "timed_out_contacts" };
    }

    const readyCount = await step.run("resolve-contact-decisions", async () => {
      let ready = 0;
      for (const rc of approvedCompanies) {
        const selectedCount = await prisma.contactCandidate.count({
          where: { researchAttempt: { runCompanyId: rc.id }, status: "SELECTED" },
        });

        if (selectedCount > 0) {
          await prisma.runCompany.update({ where: { id: rc.id }, data: { status: "CONTACTS_READY" } });
          ready += 1;
        } else {
          // TODO(Phase 3.x): contact_retry_limit 이내면 담당자 재조사로 돌아가는 루프를
          // 아직 구현하지 않았다 — 지금은 바로 예외 큐로 보낸다.
          await prisma.runCompany.update({ where: { id: rc.id }, data: { status: "EXCEPTION" } });
          await prisma.exceptionQueue.create({
            data: { runCompanyId: rc.id, reason: "제안된 담당자 후보가 모두 제외됨" },
          });
        }
      }
      return ready;
    });

    await step.run("mark-drafting-or-completed", async () => {
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: readyCount > 0 ? "DRAFTING" : "COMPLETED",
          completedAt: readyCount > 0 ? null : new Date(),
        },
      });
    });

    // Phase 4에서 여기에 사전조사+메시지 초안 생성을 연결한다.
    return { status: "contacts_decided", readyCount };
  },
);
