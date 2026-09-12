import { inngest } from "../inngest/client";
import { exportHistoryToSheets } from "../modules/backup/exportHistory";

/**
 * 매일 새벽 3시(KST) 기업/의사결정 이력을 Google Sheets에 백업한다. 테스트/수동 실행을
 * 위해 `dhbot/history.backup.requested` 이벤트로도 트리거할 수 있다(`/dhbot-backup`).
 */
export const historyBackup = inngest.createFunction(
  { id: "history-backup", name: "History Backup to Sheets" },
  [{ cron: "TZ=Asia/Seoul 0 3 * * *" }, { event: "dhbot/history.backup.requested" }],
  async ({ step }) => {
    const result = await step.run("export-history-to-sheets", () => exportHistoryToSheets());
    return result;
  },
);
