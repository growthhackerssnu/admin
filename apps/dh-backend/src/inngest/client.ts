import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "dhbot" });

export async function notifyWorker(taskId: string) {
  if (process.env.LISTUP_WORKER_ENABLED === "false") return;

  try {
    await inngest.send({ name: "listup/task.queued", data: { taskId } });
  } catch (error) {
    // The reconciler retries queued discovery and company-research tasks when
    // the event service is unavailable.
    console.error("Failed to notify listup worker", error);
  }
}

export async function notifySearchRun(searchRunId: string) {
  if (process.env.LISTUP_WORKER_ENABLED === "false") return;

  try {
    await inngest.send({
      name: "listup/search-run.progressed",
      data: { searchRunId },
    });
  } catch (error) {
    console.error("Failed to notify listup search-run orchestrator", error);
  }
}
