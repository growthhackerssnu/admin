import { inngest } from "@/dh/inngest/client";
import { syncNotionMembers } from "@/portal/lib/notionMemberSync";

// 10분마다 노션 People DB와 회원·운영팀 직책을 맞춘다(notionMemberSync.ts). 노션에는 바뀐 걸
// 알려주는 쪽이 없어서 주기적으로 읽는다 — 300여 명이라 노션 호출은 한 번에 서너 번이다.
export const syncNotionMembersCron = inngest.createFunction(
  { id: "portal-sync-notion-members", retries: 1, concurrency: { limit: 1 } },
  { cron: "*/10 * * * *" },
  async ({ step }) => step.run("sync-notion-members", () => syncNotionMembers()),
);
