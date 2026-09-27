import type { ConditionsSnapshot } from "@/config/listupExecution";
import { notifyWorker } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import {
  countAutomaticContactRounds,
  enqueueResearchTask,
} from "@/lib/listup/tasks";

export function contactSearchRequest(round: number) {
  return [
    `contact_search_round:${round}`,
    `contact_strategy:${round === 2 ? "functional_leads" : "department_leads"}`,
  ];
}

export function discoverySearchRequest(round: number, limit: number) {
  return [`discovery_round:${round}`, `discovery_limit:${limit}`];
}

export function nextSearchRunAction(input: {
  requestedCount: number;
  qualifiedCount: number;
  retryableContactCount: number;
  discoveryRounds: number;
  maxDiscoveryRounds: number;
  canVaryDiscoveryQuery: boolean;
}) {
  if (input.qualifiedCount >= input.requestedCount) return "completed" as const;
  if (input.retryableContactCount) return "contact_research" as const;
  if (
    input.discoveryRounds < input.maxDiscoveryRounds &&
    input.canVaryDiscoveryQuery
  )
    return "company_discovery" as const;
  return "partially_completed" as const;
}

function finishReason(
  qualifiedCount: number,
  requestedCount: number,
  discoveryRounds: number,
  maxDiscoveryRounds: number,
  failedTaskCount: number,
) {
  const failure = failedTaskCount ? ` ${failedTaskCount} task(s) failed.` : "";
  return `Stopped after ${discoveryRounds}/${maxDiscoveryRounds} discovery rounds with ${qualifiedCount}/${requestedCount} fit candidates with usable contacts.${failure}`;
}

export async function advanceSearchRun(searchRunId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // PostgreSQL advisory locks serialize duplicate progress events without a new table.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${searchRunId}))`;
    const run = await tx.searchRun.findUnique({
      where: { id: searchRunId },
      select: { id: true, status: true, conditionsSnapshot: true },
    });
    if (
      !run ||
      run.status === "cancelled" ||
      run.status === "failed" ||
      run.status === "completed" ||
      run.status === "partially_completed"
    )
      return { action: "ignored", taskIds: [] as string[] };

    const activeTask = await tx.researchTask.findFirst({
      where: {
        searchRunId,
        type: {
          in: [
            "company_discovery",
            "company_research",
            "fit_assessment",
            "contact_research",
          ],
        },
        status: { in: ["queued", "running"] },
      },
      select: { id: true },
    });
    if (activeTask) return { action: "waiting", taskIds: [] as string[] };

    const snapshot = run.conditionsSnapshot as unknown as ConditionsSnapshot;
    const candidates = await tx.candidate.findMany({
      where: { originSearchRunId: searchRunId },
      select: {
        id: true,
        effectiveFit: true,
        usableContactCount: true,
        contactResearchStatus: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const qualifiedCount = candidates.filter(
      (candidate) =>
        candidate.effectiveFit === "fit" && candidate.usableContactCount > 0,
    ).length;
    const contactRetries = await Promise.all(
      candidates
        .filter(
          (candidate) =>
            candidate.effectiveFit === "fit" &&
            candidate.usableContactCount === 0 &&
            candidate.contactResearchStatus === "not_found",
        )
        .map(async (candidate) => ({
          candidate,
          rounds: await countAutomaticContactRounds(tx, candidate.id),
        })),
    );
    const retryableContacts = contactRetries.filter(
      (item) => item.rounds < snapshot.execution.maxContactSearchRounds,
    );
    const discoveryRounds = await tx.researchTask.count({
      where: { searchRunId, type: "company_discovery" },
    });
    const action = nextSearchRunAction({
      requestedCount: snapshot.execution.maxCompanies,
      qualifiedCount,
      retryableContactCount: retryableContacts.length,
      discoveryRounds,
      maxDiscoveryRounds: snapshot.execution.maxDiscoveryRounds,
      canVaryDiscoveryQuery: snapshot.sources.some(
        (source) => source.key === "Google",
      ),
    });

    if (action === "completed") {
      await tx.searchRun.update({
        where: { id: searchRunId },
        data: {
          status: "completed",
          finishReason: `Requested ${snapshot.execution.maxCompanies} fit candidates with usable contacts found.`,
          finishedAt: new Date(),
        },
      });
      return { action, taskIds: [] as string[] };
    }

    if (action === "contact_research") {
      const needed = snapshot.execution.maxCompanies - qualifiedCount;
      const tasks = await Promise.all(
        retryableContacts
          .slice(0, needed)
          .map(async ({ candidate, rounds }) => {
            const task = await enqueueResearchTask(tx, {
              searchRunId,
              candidateId: candidate.id,
              type: "contact_research",
              trigger: "auto_followup",
              requestedInformation: contactSearchRequest(rounds + 1),
              followupPolicy: "automatic",
            });
            return task.reused ? null : task.task.id;
          }),
      );
      return {
        action,
        taskIds: tasks.filter((id): id is string => Boolean(id)),
      };
    }

    if (action === "company_discovery") {
      const task = await enqueueResearchTask(tx, {
        searchRunId,
        type: "company_discovery",
        trigger: "auto_followup",
        requestedInformation: discoverySearchRequest(
          discoveryRounds + 1,
          snapshot.execution.maxCompanies - qualifiedCount,
        ),
        followupPolicy: "automatic",
      });
      return { action, taskIds: task.reused ? [] : [task.task.id] };
    }

    const failedTaskCount = await tx.researchTask.count({
      where: { searchRunId, status: "failed" },
    });
    await tx.searchRun.update({
      where: { id: searchRunId },
      data: {
        status: "partially_completed",
        finishReason: finishReason(
          qualifiedCount,
          snapshot.execution.maxCompanies,
          discoveryRounds,
          snapshot.execution.maxDiscoveryRounds,
          failedTaskCount,
        ),
        finishedAt: new Date(),
      },
    });
    return { action, taskIds: [] as string[] };
  });
  await Promise.all(result.taskIds.map(notifyWorker));
  return result;
}

export async function progressableSearchRunIds(limit = 50) {
  const runs = await prisma.searchRun.findMany({
    where: { status: { in: ["queued", "running"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return runs.map((run) => run.id);
}
