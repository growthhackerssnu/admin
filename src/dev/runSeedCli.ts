import { seedDummyWorkflowRun } from "./seedDummyRun";

seedDummyWorkflowRun()
  .then(({ runId }) => {
    console.log(`더미 실행 생성 완료. runId=${runId}`);
    console.log(
      "Inngest Dev Server 대시보드(http://localhost:8288)에서 아래 이벤트를 직접 보내 워크플로우를 트리거하세요:",
    );
    console.log(JSON.stringify({ name: "dhbot/run.sourcing.requested", data: { runId } }, null, 2));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
