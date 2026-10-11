import { AppShell, useAppRole } from "@/components/ui/app-shell";
import SlackPage from "./SlackPage";

// /slack — 슬랙 백업. admin·acting과 19기 이후 알럼나이만(RequireApp이 /me의 slackBackup으로 막고,
// role은 RequireApp이 넣어 준다). 백엔드도 같은 규칙으로 막는다(src/slackExport/access.ts).
export default function Slack() {
  return (
    <AppShell role={useAppRole()} current="slack">
      <main>
        <SlackPage />
      </main>
    </AppShell>
  );
}
