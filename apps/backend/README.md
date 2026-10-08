# backend

`api.ghsnu.com`의 API 서버 하나. Next.js(App Router) API 전용 앱이고 Cloud Run에 배포한다.

모든 라우트가 `app/api/...`(→ `/api/...`)에 있고, 업무 코드는 도메인별로 나뉜다.

| 도메인 | 대표 경로 | 코드 | 상세 |
|---|---|---|---|
| portal (로그인·가입·회원 관리) | `/api/auth/*`, `/api/v1/me`, `/api/v1/admin/members*` | `src/portal` | [docs/portal.md](docs/portal.md) |
| dh (대협봇) | `/api/v1/companies`, `/candidates`, `/outreaches`, `/search-runs`…, Inngest `/api/inngest` | `src/dh` | [docs/dh.md](docs/dh.md) |
| hr (그핵드인) | `/api/v1/people`, `/api/v1/people/me`, `/api/v1/edit-requests`, `/api/v1/admin/edit-requests`, `/api/v1/field-options` | `src/hr` | [docs/hr.md](docs/hr.md) |
| nut (재무) | `/api/v1/finance/*`, `/api/v1/ping` | `src/nut` | [docs/nut.md](docs/nut.md) |
| 헬스체크 | `/api/health` (인증 없음, `SELECT 1`로 DB 커넥션도 데운다) | `app/api/health` | |

hr의 "내 정보"는 portal의 `/api/v1/me`와 겹치지 않도록 `/api/v1/people/me`다.

Prisma Client는 `packages/db/schema.prisma`에서 `src/generated/prisma`로 생성되고(`postinstall`), 모든 도메인이 `@/lib/prisma` 하나를 쓴다. 마이그레이션은 `packages/db`에서만 만든다.

## 로컬

```sh
cp .env.example .env.local
npm install                          # 저장소 루트에서
npm run dev -w apps/backend          # http://localhost:3000
npm run dev:inngest -w apps/backend  # 대협봇 비동기 작업이 필요할 때
npm test -w apps/backend
```

## 환경 변수

전체 목록과 설명은 [.env.example](.env.example).

**Cloud Run(서버 런타임)에 넣는 값**

| 이름 | 어디서 | 쓰는 곳 |
|---|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connect → **Transaction pooler**(포트 6543), 끝에 `?pgbouncer=true` | 전체 |
| `DIRECT_URL` | 같은 화면 → **Session pooler**(포트 5432) | Prisma 스키마가 참조(마이그레이션용) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | 전체(토큰 검증) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 같은 화면 → `anon` `public` 키 | 전체(토큰 검증) |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | dh 리서치·초안 생성 |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Inngest 대시보드 → 앱 → Event Keys / Signing Key | dh 비동기 작업 |
| `RESEND_API_KEY` | resend.com → API Keys | portal 가입 OTP 메일 |
| `NOTION_API_KEY` | notion.so/my-integrations → integration 토큰 | hr 디렉토리·승인(Notion 읽기/쓰기) |
| `NOTION_PEOPLE_DATABASE_ID` | Notion People DB의 database ID(integration에 공유 필요) | hr 디렉토리 |
| 선택: `RESEND_FROM_ADDRESS`, `LISTUP_*`, `ALLOWED_ORIGINS` | `.env.example` 참고. `ALLOWED_ORIGINS` 기본값은 `http://localhost:5173,https://admin.ghsnu.com` | |

**로컬 스크립트에만 필요한 값** (Cloud Run엔 불필요)

| 이름 | 스크립트 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (Supabase → API → `service_role`, 절대 프론트에 넣지 않음) | `images:migrate` |

### GH Bot 구성원 토큰 연동

관리자 발급 토큰은 `core.ghbot_access_tokens`에 인증용 SHA-256 해시와 관리자 재복사용 암호문을 저장한다.
백엔드에는 다음 값을 추가한다.

| 변수 | 용도 |
| --- | --- |
| `GHBOT_TOKEN_ENCRYPTION_KEY` | base64url 인코딩한 32바이트 키. 토큰 원문을 AES-256-GCM으로 암호화할 때만 사용한다. |
| `GHBOT_AUTH_SHARED_SECRET` | ghbot MCP 서버와 동일하게 설정하는 서버 간 인증 비밀값. |

ghbot은 `/api/v1/internal/ghbot/authenticate`로 토큰 해시 대조를 요청한다. 이 API는 사용자용 API가 아니며, 공유 비밀값 없이 호출하면 실패한다. ghbot 서비스에 admin DB 접속 문자열이나 Supabase service-role 키를 넣지 않는다.
| `NOTION_PROJECTS_DATABASE_ID`, `NOTION_PROJECT_*` | `past-projects:import` |
| `NOTION_COHORT_PROPERTY` 등 | `people:import` |

## Cloud Run 배포 (`api.ghsnu.com`)

`main`에 백엔드 관련 변경(`apps/backend`, `packages/auth`, `packages/db/schema.prisma`, `package-lock.json`, `Dockerfile`)이 push되면 `.github/workflows/deploy-backend.yml`이 저장소 루트의 `Dockerfile`로 이미지를 빌드해 Artifact Registry에 올리고 Cloud Run 서비스 `admin-backend`에 배포한다. GCP 인증은 Workload Identity Federation이다(저장소 변수 `GCP_PROJECT_ID`·`GCP_REGION`·`GCP_WIF_PROVIDER`·`GCP_DEPLOY_SA`). 수동 배포는 Actions에서 `workflow_dispatch`.

- 환경 변수·시크릿은 Cloud Run 서비스에 직접 넣는다. 워크플로는 이미지만 바꾼다.
- `PORT`는 Cloud Run이 주입하고(기본 8080) `next start`가 그대로 쓴다.
- Inngest 대시보드에 앱 URL `https://api.ghsnu.com/api/inngest`를 등록한다.

마이그레이션은 배포에 묶지 않았다. 새 컬럼을 읽는 코드를 push하기 **전에** 적용한다. `packages/db`에는 `.env.local`이 없으니 백엔드 것을 쓴다:

```sh
cd packages/db && npx dotenv -e ../../apps/backend/.env.local -- npx prisma migrate deploy --schema schema.prisma
```
