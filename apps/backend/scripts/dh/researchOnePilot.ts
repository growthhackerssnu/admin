import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import {
  executeCompanyResearchTask,
  markCompanyResearchFailed,
} from "../../src/dh/inngest/companyResearch";

// Run one queued company from the new pipeline to verify saved claims/evidence.
// No fit decision, contact research, or message generation follows this task.
const companyName = process.argv[2];
if (!companyName) throw new Error("Pass the exact company name to research.");

void (async () => {
  const task = await prisma.researchTask.findFirst({
    where: {
      pipeline: "human_review",
      type: "company_research",
      status: "queued",
      candidate: { company: { name: companyName } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!task) throw new Error("No queued human-review research task for this company.");
  try {
    const result = await executeCompanyResearchTask(task.id, randomUUID());
    console.log(JSON.stringify({ taskId: task.id, result }));
  } catch (error) {
    await markCompanyResearchFailed(task.id, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
