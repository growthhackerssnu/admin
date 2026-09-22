# 대협 어드민 백엔드

`docs/admin/api-contract.md`의 API 계약을 구현하는 Next.js(App Router, API 전용) 백엔드다. UI는 없다 — `frontend/`가 이 API를 호출하는 쪽이다.

## 스택

Next.js 14 (App Router, Route Handlers만 사용) · Prisma + Supabase Postgres · Supabase Auth(Google OAuth) · Inngest(비동기 작업) · OpenAI API(리서치·초안 생성, Phase 3에서 사용) · Vercel 배포.

## 준비

1. `npm install`
2. `.env.example`을 `.env.local`로 복사하고 값 채우기:
   - Supabase 프로젝트의 `DATABASE_URL`(풀링, 6543)/`DIRECT_URL`(다이렉트, 5432), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY` — Phase 3(리서치·초안 생성)부터 필요, 지금 당장은 비워둬도 됨
   - `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` — 로컬 개발은 비워도 됨
3. `npm run db:migrate` — 스키마 마이그레이션 생성·적용
4. `npm run db:seed` — `frontend/src/mocks/fixtures.ts`의 샘플 8개 기업을 그대로 시딩
5. `npm run dev` — `http://localhost:3000`에서 API 실행

## 인증·접근 권한

모든 `/api/v1/*` 요청은 `Authorization: Bearer <Supabase access token>` 헤더가 필요하다. 토큰은 Supabase Auth(Google OAuth)로 로그인한 뒤 발급받는다 — 이 백엔드 자체는 로그인 화면을 제공하지 않는다(프론트가 Supabase 클라이언트로 로그인 플로우를 처리한다).

**접근은 화이트리스트 방식이다.** 학회원 계정 도메인이 `ghsnu.com`/`gmail.com`/`snu.ac.kr` 등으로 섞여 있어 도메인 검사로는 거를 수 없다. Google OAuth 동의 화면은 **External**로 설정한다(Internal은 단일 Workspace 조직 소속 계정만 로그인 자체가 가능해서, 도메인이 섞인 이 상황과 맞지 않는다). 로그인 자체는 어떤 Google 계정이든 시도할 수 있지만, 관리자가 미리 `members` 테이블(대협봇 자체 DB 테이블, Supabase Auth의 사용자 목록과는 별개다)에 이메일을 등록해두지 않으면 접근이 403으로 막힌다. 접근 권한 부여·회수:

```sh
npm run members:add -- person@ghsnu.com "표시 이름" pm      # 등록 (role 생략 시 member)
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
