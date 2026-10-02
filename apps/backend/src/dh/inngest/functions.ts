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
import { collectStartupRecipe } from "./collectStartupRecipe";
import { collectTips } from "./collectTips";

// 01:00 UTC = 10:00 KST. Collection only stages names and descriptions;
// factual research runs independently on its own schedule.
export const collectStartupRecipeDaily = inngest.createFunction(
  { id: "collect-startup-recipe-daily", retries: 2 },
  { cron: "0 1 * * *" },
  async ({ step }) => step.run("collect-startup-recipe", collectStartupRecipe),
);

// 01:30 UTC — StartupRecipe와 겹치지 않게 30분 띄운다.
export const collectTipsDaily = inngest.createFunction(
  { id: "collect-tips-daily", retries: 2 },
  { cron: "30 1 * * *" },
  async ({ step }) => step.run("collect-tips", collectTips),
);

export const processListupTask = inngest.createFunction(
  {
    id: "process-listup-task",
    retries: 2,
    onFailure: async ({ event, error }) => {
      const taskId = (event.data as { taskId?: string }).taskId;
      if (taskId) {
        const task = await prisma.researchTask.findUnique({
          where: { id: taskId },
          select: { searchRunId: true, pipeline: true },
        });
        if (task?.pipeline === "legacy") {
          await Promise.all([
            markDiscoveryFailed(taskId, error.message),
            markCompanyResearchFailed(taskId, error.message),
            markFitAssessmentFailed(taskId, error.message),
            markContactResearchFailed(taskId, error.message),
          ]);
          if (task.searchRunId) await notifySearchRun(task.searchRunId);
        } else if (task?.pipeline === "human_review") {
          await markCompanyResearchFailed(taskId, error.message);
        }
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
        select: { type: true, searchRunId: true, pipeline: true },
      });
      const result =
        task?.pipeline === "human_review" && task.type === "company_research"
          ? await executeCompanyResearchTask(taskId, eventId)
          : task?.pipeline !== "legacy"
            ? { ignored: true }
            : task.type === "company_discovery"
          ? await executeDiscoveryTask(taskId, eventId)
          : task?.type === "company_research"
            ? await executeCompanyResearchTask(taskId, eventId)
            : task?.type === "fit_assessment"
              ? await executeFitAssessmentTask(taskId, eventId)
              : task?.type === "contact_research"
                ? await executeContactResearchTask(taskId, eventId)
                : { ignored: true };
      if (task?.pipeline === "legacy" && task.searchRunId)
        await notifySearchRun(task.searchRunId);
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

export const queueHumanReviewResearch = inngest.createFunction(
  { id: "queue-human-review-research", retries: 2 },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    if (process.env.HUMAN_REVIEW_PIPELINE_ENABLED !== "true") return { disabled: true };
    const taskIds = await step.run("find-human-review-research", () =>
      queuedCompanyResearchTaskIds(200, "human_review"),
    );
    await step.run("notify-human-review-research", () =>
      Promise.all(taskIds.map(notifyWorker)),
    );
    return { taskCount: taskIds.length };
  },
);

export const inngestFunctions = [
  collectStartupRecipeDaily,
  collectTipsDaily,
  queueHumanReviewResearch,
  processListupTask,
  progressListupSearchRun,
  reconcileQueuedListupTasks,
];
