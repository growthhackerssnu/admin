import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { outreachRun } from "@/workflows/outreach-run";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [outreachRun],
});
