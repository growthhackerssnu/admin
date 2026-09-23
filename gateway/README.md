# gateway

`admin.ghsnu.com` 도메인을 소유하고, 경로별로 각 앱의 Vercel 배포로 리라이트하는 역할만 담당하는 Vercel 프로젝트입니다. 자체 코드는 없습니다.

- `/dh/*` → `apps/dh-frontend` 배포 (대협봇)
- `/hr/*` → `apps/hr-frontend` 배포 (그핵드인, 준비 중)
- `/admin/*` → `apps/dh-frontend` 배포의 관리자 페이지 (`/admin`)

각 앱은 독립된 Vercel 프로젝트로 배포됩니다(Root Directory를 앱별로 지정). `gateway`는 이 저장소를 Root Directory로 하는 별도의 Vercel 프로젝트이며, `admin.ghsnu.com` 도메인을 이 프로젝트에 연결하고 `vercel.json`의 `rewrites`로 나머지 앱 배포 URL을 가리킵니다.

`vercel.json`의 리라이트 대상 URL은 각 앱의 실제 프로덕션 배포가 생기면 채워 넣어야 합니다(현재는 자리표시자).
