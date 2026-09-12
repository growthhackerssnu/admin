import { inngest } from "../inngest/client";
import { prisma } from "../lib/prisma";
import { postCompanyApprovalCards } from "../slack/blocks/companyApprovalCard";
import { postContactApprovalCards } from "../slack/blocks/contactApprovalCard";
import { runSourcingPipeline } from "../modules/sourcing/pipeline";
import { researchAndPersistContacts } from "../modules/contacts/persistContacts";
import { createDraftForContactCandidate } from "../modules/drafting/persistDraft";
import { postDraftSkeletonCard } from "../slack/blocks/messageDraftCard";
import { slackClient, SLACK_APPROVAL_CHANNEL_ID } from "../slack/client";

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
        // 사람이 계속 기다리지 않도록, 빈손으로 끝났다는 것도 명시적으로 알려준다.
        await slackClient.chat.postMessage({
          channel: SLACK_APPROVAL_CHANNEL_ID,
          text: `⚠️ 이번 소싱 실행에서는 조건에 맞는 기업 후보를 찾지 못했습니다 (runId: ${runId}). 뉴스 피드에 마침 관련 기사가 없었을 수 있어요 — 나중에 다시 시도해보세요.`,
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
        await slackClient.chat.postMessage({
          channel: SLACK_APPROVAL_CHANNEL_ID,
          text: `⚠️ 기업 후보 승인이 3일 안에 제출되지 않아 이번 실행을 종료합니다 (runId: ${runId}). 필요하면 다시 트리거해주세요.`,
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

    const contactRetryLimit = (await step.run("load-contact-retry-limit", async () => {
      const run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: runId }, include: { config: true } });
      return run.config.contactRetryLimit;
    })) as number;

    // 담당자 후보를 전부 거절당한 회사는, 한도(contact_retry_limit) 안에서는 그 회사만
    // 다시 조사해 새 후보를 올린다 — 매 라운드 pendingIds만 좁혀가며 반복한다.
    let pendingIds = approvedCompanies.map((rc) => rc.id);
    const readyIds: string[] = [];
    let round = 0;

    while (pendingIds.length > 0) {
      round += 1;
      const roundCompanies = approvedCompanies.filter((rc) => pendingIds.includes(rc.id));

      // 담당자 발굴은 회사마다 Claude+web_search 호출(최대 4회)이 들어가 시간이 걸리므로,
      // 소싱과 마찬가지로 회사별로 별도 step으로 쪼갠다(Vercel 함수 1회 호출 제한 회피).
      for (const rc of roundCompanies) {
        await step.run(`discover-contacts-${rc.id}-r${round}`, () => researchAndPersistContacts(rc.id, round));
      }

      const runCompaniesWithCandidates = await step.run(`load-contact-candidates-r${round}`, () =>
        prisma.runCompany.findMany({
          where: { id: { in: pendingIds } },
          include: {
            company: true,
            researchAttempts: {
              where: { stage: "CONTACT_DISCOVERY", attemptNo: round },
              include: { contactCandidates: { include: { contact: { include: { contactMethods: true } } } } },
            },
          },
        }),
      );

      await step.run(`post-contact-approval-cards-r${round}`, async () => {
        const cards = runCompaniesWithCandidates.map((rc) => ({
          id: rc.id,
          company: rc.company,
          contactCandidates: rc.researchAttempts[0]?.contactCandidates ?? [],
        }));
        await postContactApprovalCards(runId, cards, round > 1 ? round : undefined);
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { status: "AWAITING_CONTACT_APPROVAL" },
        });
      });

      const contactDecisionEvent = await step.waitForEvent(`wait-for-contact-decisions-r${round}`, {
        event: "dhbot/contact.decision.batch",
        timeout: "3d",
        match: "data.runId",
      });

      if (!contactDecisionEvent) {
        await step.run(`mark-contact-timed-out-r${round}`, async () => {
          await prisma.workflowRun.update({
            where: { id: runId },
            data: { status: "FAILED", completedAt: new Date() },
          });
          await slackClient.chat.postMessage({
            channel: SLACK_APPROVAL_CHANNEL_ID,
            text: `⚠️ 담당자 후보 승인이 3일 안에 제출되지 않아 이번 실행을 종료합니다 (runId: ${runId}, ${round}차 라운드).`,
          });
        });
        return { status: "timed_out_contacts", round };
      }

      const resolution = (await step.run(`resolve-contact-decisions-r${round}`, async () => {
        const readyThisRound: string[] = [];
        const stillPendingThisRound: string[] = [];
        for (const id of pendingIds) {
          const selectedCount = await prisma.contactCandidate.count({
            where: { researchAttempt: { runCompanyId: id }, status: "SELECTED" },
          });

          if (selectedCount > 0) {
            await prisma.runCompany.update({ where: { id }, data: { status: "CONTACTS_READY" } });
            readyThisRound.push(id);
          } else if (round < contactRetryLimit) {
            stillPendingThisRound.push(id);
          } else {
            await prisma.runCompany.update({ where: { id }, data: { status: "EXCEPTION" } });
            await prisma.exceptionQueue.create({
              data: { runCompanyId: id, reason: `담당자 후보를 ${round}회 재조사했지만 선택된 인원이 없음` },
            });
          }
        }
        return { readyThisRound, stillPendingThisRound };
      })) as { readyThisRound: string[]; stillPendingThisRound: string[] };

      readyIds.push(...resolution.readyThisRound);
      pendingIds = resolution.stillPendingThisRound;
    }

    const readyCount = readyIds.length;

    await step.run("mark-drafting-or-completed", async () => {
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: readyCount > 0 ? "DRAFTING" : "COMPLETED",
          completedAt: readyCount > 0 ? null : new Date(),
        },
      });
    });

    if (readyCount === 0) {
      return { status: "contacts_decided", readyCount };
    }

    // 선택된 담당자 각각에 대해 사전조사+초안 스켈레톤을 만든다. proposal_input은 항상
    // 공란으로 남기고, 실제 제안 작성/최종 발송은 Slack 모달을 통해 사람이 직접 한다
    // (draft_action:open_modal 핸들러, app.ts) — 이 durable workflow는 여기서 끝난다.
    const selectedCandidates = await step.run("load-selected-contact-candidates", () =>
      prisma.contactCandidate.findMany({
        where: { researchAttempt: { runCompanyId: { in: approvedCompanies.map((rc) => rc.id) } }, status: "SELECTED" },
        include: {
          contact: true,
          researchAttempt: { include: { runCompany: { include: { company: true } } } },
        },
      }),
    );

    for (const candidate of selectedCandidates) {
      await step.run(`generate-draft-${candidate.id}`, async () => {
        const result = await createDraftForContactCandidate(candidate.id);
        if (!result) return;

        const draft = await prisma.messageDraft.findUniqueOrThrow({ where: { id: result.draftId } });
        await postDraftSkeletonCard({
          id: draft.id,
          companyName: candidate.researchAttempt.runCompany.company.name,
          contactName: candidate.contact.name,
          contactJobTitle: candidate.contact.jobTitle,
          researchSummary: draft.researchSummary ?? "",
          problemHypothesis: draft.problemHypothesis ?? "",
          body: draft.body ?? "",
        });
      });
    }

    return { status: "drafts_ready", readyCount, draftCount: selectedCandidates.length };
  },
);
