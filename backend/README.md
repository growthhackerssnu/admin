# 대협 어드민 백엔드

`docs/admin/api-contract.md`의 API 계약을 구현하는 Next.js(App Router, API 전용) 백엔드다. UI는 없다 — `frontend/`가 이 API를 호출하는 쪽이다.

## 스택

Next.js 14 (App Router, Route Handlers만 사용) · Prisma + Supabase Postgres · Supabase Auth(Google OAuth) · Inngest(비동기 작업) · OpenAI API(리서치·초안 생성, Phase 3에서 사용) · Vercel 배포.

## 준비

1. `npm install`
2. `.env.example`을 `.env.local`로 복사하고 값 채우기:
   - Supabase 프로젝트의 `DATABASE_URL`(Transaction pooler, 6543)/`DIRECT_URL`(**Session pooler**, 5432 — 대시보드의 "Direct connection" 탭 값이 아니다. 그건 IPv6 전용이라 일반 네트워크에서 `prisma migrate`가 "Can't reach database server"로 막힌다), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NOTION_API_KEY`/`NOTION_PEOPLE_DATABASE_ID` — 가입 흐름(아래 참고)에 필요. 지금 당장은 비워둬도 나머지 개발엔 지장 없음
   - `RESEND_API_KEY` — 가입 OTP 메일 발송에 필요. 도메인 인증 전엔 `RESEND_FROM_ADDRESS`를 비워두면 resend.dev 테스트 주소로 발송됨
   - `OPENAI_API_KEY` — Phase 3(리서치·초안 생성)부터 필요, 지금 당장은 비워둬도 됨
   - `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` — 로컬 개발은 비워도 됨
3. `npm run db:migrate` — 스키마 마이그레이션 생성·적용
4. `npm run db:seed` — `frontend/src/mocks/fixtures.ts`의 샘플 8개 기업을 그대로 시딩
5. `npm run dev` — `http://localhost:3000`에서 API 실행

`db:migrate`/`db:seed`/`members:*`/`people:import`는 전부 `dotenv-cli`로 `.env.local`을 로드한다(`prisma` CLI와 `tsx` 둘 다 `.env.local`을 자동으로 읽지 않기 때문 — `npm run dev`의 `next dev`만 자동으로 읽는다). 새 스크립트를 추가할 때도 이 패턴을 따른다.

## 역할(Role)

`admin.ghsnu.com` 전체(대협봇 dh + hr)에 걸친 권한이며, 이 저장소는 그중 `/dh`(대협봇)만 담당한다.

| role | 범위 |
|---|---|
| `admin` | `admin@ghsnu.com` 고정 하나. 전 영역 접근·편집, 회원 role 변경/삭제 |
| `acting` | 현재 액팅 회원. dh+hr 업무 권한 전부 동일(PM 서브권한 없음 — 차수 시작도 누구나) |
| `alumni` | 가입한 알럼나이. **`/dh`(이 백엔드) 접근 자체가 막힌다** — `getAuthenticatedMember`가 곧바로 403. hr은 보기 전용(이 저장소 범위 밖) |

가입 직후에는 **무조건 `alumni`로 등록된다.** `people_directory`(아래)는 "이 사람이 진짜 명단에 있는 사람인지"만 확인하는 용도이고, 거기엔 액팅/알럼나이 구분이 없다 — admin이 `admin.ghsnu.com/admin`(이 저장소 범위 밖, 별도 관리자 페이지)에서 개별로 `acting`으로 승격시킨다. `admin`으로의 승격은 그 화면에서도 불가 — 수동으로만.

## 가입 (Notion People DB 연동)

학회원 확인은 "기수+이름+원하는 구글 이메일로 가입 신청 → 노션에 기록된 신뢰 이메일로 OTP 발송 → 인증 성공 시 그 구글 이메일로 `alumni` role 등록" 흐름이다. 노션 People DB를 우리 DB(`people_directory`)로 동기화(본인 확인용 사본일 뿐, role 판단에는 안 씀):

```sh
npm run people:import
```

노션 데이터베이스를 먼저 해당 integration에 Share 해야 하고(`.env.example`의 `NOTION_API_KEY` 주석 참고), 컬럼명이 기본 가정(기수/Name/이메일)과 다르면 `NOTION_COHORT_PROPERTY`/`NOTION_NAME_PROPERTY`/`NOTION_EMAIL_PROPERTY`로 실제 컬럼명을 지정한다.

가입 신청/인증 엔드포인트(인증 불필요, 로그인 전 흐름):

| API | 설명 |
|---|---|
| `POST /api/auth/signup-requests` | `{cohort, name, desiredEmail}` → `people_directory` 대조 → 매칭되면 그 사람의 노션 신뢰 이메일로 OTP 발송(Resend). 응답에 `signupRequestId`와 마스킹된 발신 주소(`sentTo`)를 준다 |
| `POST /api/auth/signup-requests/{id}/verify` | `{otp}` → 일치하면 `desiredEmail`로 `members` 행을 `role: alumni`로 생성, `people_directory.claimedByMemberId` 기록. 이후 그 이메일로 Google 로그인하면 접근 가능(alumni 권한 범위 내) |

OTP는 10분 유효, 5회 틀리면 그 신청은 만료 처리(다시 신청해야 함), 60초 안에 재신청하면 막는다(`src/lib/otp.ts`). 이미 가입 완료된 사람, 이미 쓰이는 이메일, 기수+이름이 명단에 없거나 중복인 경우는 각각 명확한 오류 메시지로 막는다.

## 인증·접근 권한

모든 `/api/v1/*` 요청은 `Authorization: Bearer <Supabase access token>` 헤더가 필요하다. 토큰은 Supabase Auth(Google OAuth)로 로그인한 뒤 발급받는다 — 이 백엔드 자체는 로그인 화면을 제공하지 않는다(프론트가 Supabase 클라이언트로 로그인 플로우를 처리한다).

**접근은 화이트리스트 방식이다.** 학회원 계정 도메인이 `ghsnu.com`/`gmail.com`/`snu.ac.kr` 등으로 섞여 있어 도메인 검사로는 거를 수 없다. Google OAuth 동의 화면은 **External**로 설정한다(Internal은 단일 Workspace 도메인 소속 계정만 로그인 자체가 가능해서, 도메인이 섞인 이 상황과 맞지 않는다). 로그인 자체는 어떤 Google 계정이든 시도할 수 있지만, `members` 테이블(대협봇 자체 DB 테이블, Supabase Auth의 사용자 목록과는 별개다)에 이메일이 등록돼 있지 않으면 접근이 403으로 막힌다. 보통은 위 가입 흐름으로 자동 등록되고, admin이나 예외 케이스만 수동으로:

```sh
npm run members:add -- person@ghsnu.com "표시 이름" admin   # 등록 (role 생략 시 acting)
npm run members:remove -- person@ghsnu.com                  # 회수 (행은 남기고 비활성화만)
```

이 사람이 처음 로그인하는 순간 Supabase user id가 자동으로 연결된다.

## 구현 범위

- **완료(Phase 1)**: 조회 11종(`GET /me, /cycles, /search-options, /companies, /companies/{id}, /outreaches/{id}, /outreaches/{id}/contacts, /companies/{id}/history, /sends/{id}, /template-bindings, /members`)
- **다음(Phase 2)**: 검토/수신자/초안/응답 쓰기 9종
- **다음(Phase 3)**: 차수 시작·탐색, 관계자 탐색, 초안 생성 — Inngest 비동기 작업
- **다음(Phase 4)**: 발송은 수동 기록(`manual-send-records`)만. 시스템이 직접 이메일을 보내는 기능은 범위 밖이다.
- **범위 밖**: 소싱·수집 파이프라인(뉴스레터 → 기업 후보), 수주 확정, Notion 동기화 — `docs/admin/integration/05_데이터 모델 제안.md`와 `docs/admin/api-contract.md` §12 참고.

## 참고 문서

- [API 계약](../docs/admin/api-contract.md)
- [데이터 모델](../docs/admin/integration/05_데이터%20모델%20제안.md)
- [정책·확정 규칙](../docs/admin/policies.md), [업무 흐름](../docs/admin/workflow.md)
- [프론트 연결 지점](../frontend/README.md) — `frontend/src/services/liveRepository.ts`(아직 없음)가 이 API를 호출하도록 `frontend/src/main.tsx`에서 조립해야 한다. 프론트의 한국어 Stage enum ↔ 이 API의 영문 코드 변환은 그 어댑터의 책임이며 이 백엔드의 범위는 아니다.
