import { inngest, notifySearchRun, notifyWorker } from "./client";
import {
  executeCompanyResearchTask,
  markCompanyResearchFailed,
  queuedCompanyResearchTaskIds,
} from "./companyResearch";
import {
  executeFitAssessmentTask,
  markFitAssessmentFailed,
  queuedFitAssessmentTaskIds,
} from "./fitAssessment";
import {
  executeContactResearchTask,
  markContactResearchFailed,
  queuedContactResearchTaskIds,
} from "./contactResearch";
import {
  executeDiscoveryTask,
  markDiscoveryFailed,
  queuedDiscoveryTaskIds,
} from "./listupDiscovery";
import {
  advanceSearchRun,
  progressableSearchRunIds,
} from "./searchRunOrchestrator";
import { prisma } from "@/lib/prisma";

export const processListupTask = inngest.createFunction(
  {
    id: "process-listup-task",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const taskId = (event.data as { taskId?: string }).taskId;
      if (taskId) {
        const task = await prisma.researchTask.findUnique({
          where: { id: taskId },
          select: { searchRunId: true },
        });
        await Promise.all([
          markDiscoveryFailed(taskId, error.message),
          markCompanyResearchFailed(taskId, error.message),
          markFitAssessmentFailed(taskId, error.message),
          markContactResearchFailed(taskId, error.message),
        ]);
        if (task) await notifySearchRun(task.searchRunId);
      }
    },
  },
  { event: "listup/task.queued" },
  async ({ event, step }) => {
    const taskId = (event.data as { taskId: string }).taskId;
    const eventId = event.id;
    if (!eventId) throw new Error("Inngest event id is required.");
    // `event.id` remains stable across Inngest retries. A separately emitted
    // event gets a different id and is therefore ignored while this task runs.
    return step.run("process-task", async () => {
      const task = await prisma.researchTask.findUnique({
        where: { id: taskId },
        select: { type: true, searchRunId: true },
      });
      const result =
        task?.type === "company_discovery"
          ? await executeDiscoveryTask(taskId, eventId)
          : task?.type === "company_research"
            ? await executeCompanyResearchTask(taskId, eventId)
            : task?.type === "fit_assessment"
              ? await executeFitAssessmentTask(taskId, eventId)
              : task?.type === "contact_research"
                ? await executeContactResearchTask(taskId, eventId)
                : { ignored: true };
      if (task) await notifySearchRun(task.searchRunId);
      return result;
    });
  },
);

export const progressListupSearchRun = inngest.createFunction(
  { id: "progress-listup-search-run", retries: 2 },
  { event: "listup/search-run.progressed" },
  async ({ event, step }) => {
    const searchRunId = (event.data as { searchRunId: string }).searchRunId;
    return step.run("advance-search-run", () => advanceSearchRun(searchRunId));
  },
);

export const reconcileQueuedListupTasks = inngest.createFunction(
  { id: "reconcile-queued-listup-tasks" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const queued = await step.run("find-queued-listup-work", async () => {
      const [discoveryTaskIds, researchTaskIds, fitTaskIds, contactTaskIds] =
        await Promise.all([
          queuedDiscoveryTaskIds(),
          queuedCompanyResearchTaskIds(),
          queuedFitAssessmentTaskIds(),
          queuedContactResearchTaskIds(),
        ]);
      return {
        taskIds: [
          ...discoveryTaskIds,
          ...researchTaskIds,
          ...fitTaskIds,
          ...contactTaskIds,
        ],
        searchRunIds: await progressableSearchRunIds(),
      };
    });
    await step.run("notify-queued-listup-work", () =>
      Promise.all([
        ...queued.taskIds.map(notifyWorker),
        ...queued.searchRunIds.map(notifySearchRun),
      ]),
    );
    return {
      taskCount: queued.taskIds.length,
      searchRunCount: queued.searchRunIds.length,
    };
  },
);

export const inngestFunctions = [
  processListupTask,
  progressListupSearchRun,
  reconcileQueuedListupTasks,
];
