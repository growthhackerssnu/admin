// 운영 서버 시작점(`npm run start`). Cloud Run은 시크릿을 Secret Manager 시크릿 하나
// (ADMIN_BACKEND_SECRETS, {"이름": "값"} JSON)로 받는다 — 시크릿 버전마다 요금이 붙어서
// 열몇 개를 따로 두지 않고 묶었다. 여기서 풀어 환경 변수로 넣고 next start를 띄운다.
// 이미 따로 들어온 환경 변수는 덮어쓰지 않는다. 묶음이 없으면(로컬) 그냥 next start다.
//
// 묶음에 값을 더하거나 바꾸는 법은 apps/backend/README.md "Cloud Run 배포" 참고.
import { spawn } from "node:child_process";

const env = { ...process.env };
const bundle = process.env.ADMIN_BACKEND_SECRETS;
if (bundle) {
  for (const [key, value] of Object.entries(JSON.parse(bundle))) {
    if (env[key] === undefined) env[key] = String(value);
  }
  delete env.ADMIN_BACKEND_SECRETS;
}

const child = spawn("next", ["start", ...process.argv.slice(2)], { stdio: "inherit", env });
// Cloud Run은 인스턴스를 내릴 때 SIGTERM을 보낸다 — next에 그대로 넘긴다.
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
