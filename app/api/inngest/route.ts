import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { outreachRun } from "@/workflows/outreach-run";
import { forgottenCompanyRescan } from "@/workflows/forgotten-company-rescan";
import { historyBackup } from "@/workflows/history-backup";

// 소싱 파이프라인의 evaluate-candidate 스텝은 Claude + web_search 호출로 오래 걸릴 수 있어
// Vercel Hobby 플랜에서 허용하는 최대치로 늘려둔다.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [outreachRun, forgottenCompanyRescan, historyBackup],
});
