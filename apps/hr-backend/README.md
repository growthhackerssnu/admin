# hr-backend (그핵드인)

알럼나이 관리 백엔드. **뼈대만 있고 업무 로직은 아직 없다** — `app/api/v1/ping`만 있고, 그건 스캐폴딩 확인용이라 첫 업무 라우트를 만들 때 지워도 된다.

UI는 없다(API 전용). `apps/hr-frontend`가 이 API를 호출하는 쪽이 될 예정이며, 아직 만들어지지 않았다.

## 시작하기 전에 — 필독

**[DB 공유 규칙](../../docs/db/conventions.md)을 먼저 읽어주세요.** hr은 공유 Postgres에 세 번째로 합류하는 앱이라, 이미 정해진 경계를 모르고 시작하면 dh·portal 쪽을 깨뜨리기 쉽습니다. 최소한 §2(스키마 구조), §5(`members` 규칙), §7(마이그레이션 위치)는 보고 오세요.

핵심만 세 줄로:

- `hr` 스키마는 **네 것**이다. 자유롭게 테이블을 만든다.
- `core`(회원·신원)는 **portal 것**이다. 읽기만 한다 — `role`/`active`를 바꾸지 않는다.
- `dh`(대협봇)는 **접근하지 않는다.** 필요하면 API로 요청한다(§3.2).

## 준비

```sh
npm install                      # 저장소 루트에서
cp .env.example .env.local       # 값은 apps/portal-backend/.env.local과 같은 Supabase 프로젝트
npm run dev                      # http://localhost:3002
```

동작 확인:

```sh
curl http://localhost:3002/api/v1/ping
# {"error":{"code":"UNAUTHENTICATED", ...}}  ← 토큰이 없으니 401이 정상이다
```

실제 데이터를 보려면 포털(`http://localhost:5174`)에서 로그인해 받은 Supabase access token을 `Authorization: Bearer <token>`으로 넘긴다.

| 앱 | 로컬 포트 |
|---|---|
| `apps/portal-backend` | 3001 |
| `apps/dh-backend` | 3000 |
| **`apps/hr-backend`** | **3002** |
| `apps/hr-frontend`(예정) | 5175 |

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `src/lib/auth.ts` | 인증 진입점. 정책은 `@dhbot/auth`에 있고 여기선 Prisma·ApiError·거부 대상만 주입한다 |
| `src/lib/apiHandler.ts` | 모든 라우트를 감싸는 래퍼 — requestId·인증·에러 봉투 |
| `src/lib/errors.ts` | `ApiError`와 응답 봉투. 필요한 에러 코드가 생기면 여기에 추가한다 |
| `src/lib/prisma.ts` | Prisma 클라이언트 싱글턴 |
| `prisma/schema.prisma` | 이 앱이 쓰는 테이블 목록. 지금은 `core.members`만 |
| `middleware.ts` | CORS (로컬 5175 + `admin.ghsnu.com`) |
| `app/api/v1/ping/route.ts` | 라우트 작성 패턴 예시. 지워도 된다 |

## 첫 테이블 만들기

`hr` Postgres 스키마는 **비어 있는 상태로 이미 만들어져 있다.** 테이블 정의가 정해지면:

1. `packages/db/schema.prisma`의 `datasource.schemas`에 `"hr"` 추가
2. 거기에 모델을 만들고 각각 `@@schema("hr")` 명시
3. `cd packages/db && npm run db:migrate`
4. 그 모델을 `apps/hr-backend/prisma/schema.prisma`에도 복사하고 `schemas`에 `"hr"` 추가
5. `npm run db:generate`
6. [conventions.md §4](../../docs/db/conventions.md)의 데이터 딕셔너리에 한 줄씩 추가

> **이 앱에서 `prisma migrate`를 실행하지 마세요.** 이 앱의 `schema.prisma`는 "내가 쓰는 테이블 목록"일 뿐 DB 전체를 모릅니다. Prisma가 모르는 테이블(dh 전체 등)을 삭제 대상으로 판단합니다. 여기서는 `db:generate`만 돌립니다.

## 아직 정해지지 않은 것

- **alumni 권한 범위** — 지금 `src/lib/auth.ts`는 role을 막지 않는다(`deny` 없음). 라우팅 문서상 alumni는 hr에서 "보기 전용"인데, 그걸 `deny`로 막을지 라우트별로 `member.role`을 보고 나눌지는 첫 쓰기 API를 만들 때 정한다.
- **멱등성** — 쓰기 API를 만들면 `withIdempotency` 패턴이 필요하다. `apps/portal-backend/src/lib/idempotency.ts`를 복사해 오되, 테이블은 `hr.idempotency_keys`를 새로 만든다([§4.1](../../docs/db/conventions.md) — 앱마다 자기 테이블을 갖는다).
- **hr 프론트엔드** — `apps/hr-frontend`는 아직 빈 자리다.

## 관련 문서

- [DB 공유 규칙](../../docs/db/conventions.md) — 스키마 경계, 소유권, 변경 절차
- [라우팅 구조](../../docs/admin/routing.md) — 세 앱이 `admin.ghsnu.com` 아래 어떻게 연결되는지
- [포털 백엔드](../portal-backend/README.md) — 로그인·가입·회원 관리. 참고할 라우트 구현이 많다
