# admin

대협 어드민을 새로 구현하기 위한 업무 설계, 클릭 목업, 프론트·백엔드 구현입니다. PR #3의 자료를 유지하고 이전 서비스 구현은 제거했습니다. `apps/frontend`(`/dh`)에 샘플 어댑터를 쓰는 프론트, `apps/backend`(`src/dh`)에 API 계약 구현이 진행 중입니다(조회 API 완료, 쓰기·비동기 작업은 진행 중). 프론트-백엔드 실 연결(liveRepository)은 아직입니다.

`admin.ghsnu.com` 통합 어드민 포털(로그인·회원 관리 `/`·`/admin`, 대협봇 `/dh`, 그핵드인 `/hr`, NUT `/nut`)을 모노레포로 운영합니다. 배포 단위는 두 개입니다.

- **프론트 — `admin.ghsnu.com`, Vercel 프로젝트 하나**(`apps/frontend`, 루트 `vercel.json`). 포털·대협봇·그핵드인·NUT이 라우터 하나를 쓰는 단일 SPA라 화면 간 이동에 새로고침이 없습니다. 설정은 [apps/frontend/README.md](apps/frontend/README.md).
- **백엔드 — `api.ghsnu.com`, Railway 서비스 하나**(`apps/backend`, 루트 `railway.json`). 모든 API가 `/api/...` 아래에 있습니다. 설정은 [apps/backend/README.md](apps/backend/README.md).

앱 간 공유 디자인 토큰·스타일은 `packages/ui-shell`, 인증 헬퍼는 `packages/auth`, DB 스키마·마이그레이션은 `packages/db`에 있습니다.

- [백엔드 실행·배포](apps/backend/README.md)
- [포털 백엔드(로그인·가입·회원 관리 API)](apps/backend/docs/portal.md)
- [프론트 실행·배포](apps/frontend/README.md)
- [대협봇 백엔드 실행·구조 안내](apps/backend/docs/dh.md)
- [그핵드인 백엔드(스캐폴딩 — hr 담당자 시작점)](apps/backend/docs/hr.md)
- [공유 UI 패키지](packages/ui-shell/README.md)
- [DB 패키지(스키마·마이그레이션 원본)](packages/db/README.md)
- [라우팅 구조 — 포털·dh·hr을 어떻게 나누고 연결하는지](docs/admin/routing.md)
- [DB 공유 규칙 — 세 앱이 Supabase 하나를 같이 쓰는 방법 (스키마 작업 전 필독)](docs/db/conventions.md)
- [설계·정책·연동 제안](docs/admin/README.md)
- [신규 리스트업 업무 규칙](docs/admin/listup/README.md)
- [목업 실행 안내](prototypes/admin/README.md)

## 목업 실행

Python 3가 있는 환경에서 저장소 루트에서 실행합니다.

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory prototypes/admin
```

http://127.0.0.1:8765/ 에 접속합니다. CDN을 불러오므로 인터넷 연결이 필요합니다. 가상 데이터와 브라우저 저장을 사용하는 시연이며 실제 조사·발송·DB 연동은 없습니다.

## 새 구현의 기준

확정 업무 정책과 미정 사항을 구분해 읽어주세요. 문서의 API·필드명은 제안입니다. 프레임워크와 데이터 구조는 새 구현 담당자가 결정하며, 기존 Next.js·Prisma 모델을 재사용해야 하는 제약은 없습니다.

[과거 구현](https://github.com/growthhackerssnu/dhbot/tree/ecccb287947b9c266d74f02b356463dc03dc4c21)은 Git 이력에 남아 있습니다. 코드 제거는 실제 DB·외부 서비스·배포를 삭제하거나 중단하지 않습니다.
