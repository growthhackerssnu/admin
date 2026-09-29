import { serve } from "inngest/next";
import { inngest } from "@/dh/inngest/client";
import { inngestFunctions } from "@/dh/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
