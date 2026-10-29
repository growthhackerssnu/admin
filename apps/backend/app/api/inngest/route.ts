import { serve } from "inngest/next";
import { inngest } from "@/dh/inngest/client";
import { inngestFunctions } from "@/dh/inngest/functions";
import { syncNotionMembersCron } from "@/portal/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...inngestFunctions, syncNotionMembersCron],
});
