# DB 공유 규칙 — portal · dh · hr

기준일: 2026-09-23. `admin.ghsnu.com` 아래 세 앱(portal·dh·hr)이 **Supabase 프로젝트 하나, Postgres 하나**를 같이 쓴다. 이 문서는 그 DB에서 어느 테이블이 누구 것이고, 누가 무엇을 바꿀 수 있고, 바꿀 때 어떤 절차를 밟는지를 정한다.

앱을 어떻게 나누고 경로로 연결하는지는 [라우팅 구조](../admin/routing.md)에, 업무 정책은 [docs/admin](../admin/README.md)에 있다. 이 문서는 **데이터 계층만** 다룬다.

---

## 0. 이 문서는 읽고 시작한다 (필수)

**아래에 해당하면 작업 전에 이 문서를 끝까지 읽는다.**

- `apps/*-backend`에서 Prisma 스키마나 마이그레이션을 건드리는 사람
- 테이블·컬럼·enum을 새로 만들거나 이름을 바꾸거나 지우는 사람
- `members`, `people_directory` 등 **다른 앱과 공유하는 테이블**을 읽거나 쓰는 코드를 짜는 사람
- **프론트엔드에서 `supabase.from()`으로 테이블을 직접 조회하려는 사람** — §6이 이 경우를 다룬다. 권한 검사가 백엔드에서 DB로 넘어가므로 규칙이 다르다.
- `apps/hr-backend`를 처음 구현하는 사람 — **특히 이 경우 필수다.** hr은 세 번째로 합류하는 앱이라, 이미 정해진 경계를 모르고 시작하면 dh/portal 쪽을 깨뜨리기 쉽다.

**읽었다는 확인 방법**: DB 구조를 바꾸는 PR(= `packages/db/` 또는 `apps/*/prisma/`를 건드리는 PR)에는 설명에 아래 체크리스트를 붙이고, 해당 항목에 체크한다.

```markdown
- [ ] docs/db/conventions.md를 읽었다
- [ ] 추가·변경한 테이블을 §4 데이터 딕셔너리에 반영했다
- [ ] 새 테이블을 만들었다면 RLS를 켰다 (§6.2)
- [ ] 다른 앱이 읽는 테이블을 건드렸다면 해당 앱 담당자의 리뷰를 받았다
```

딕셔너리(§4)가 갱신되지 않은 스키마 변경 PR은 머지하지 않는다. 표가 실제와 달라지는 순간 이 문서는 아무도 안 믿는 문서가 되고, 그때부터는 규칙이 없는 것과 같다.

---

## 1. 왜 규칙이 필요한가

DB를 공유하는 건 **데이터를 공유하려고** 한 선택이다. 회원 명단(`members`)이 앱마다 따로 있으면 누굴 승인했는지가 어긋나고, 로그인 한 번으로 `/dh`와 `/hr`을 오가는 지금 구조 자체가 성립하지 않는다.

문제는 DB를 공유하면 **경계가 눈에 안 보인다**는 점이다. API는 없는 endpoint를 부르면 404가 나지만, DB는 남의 테이블을 SELECT해도 UPDATE해도 아무 일 없이 성공한다. 그래서 다음 세 가지가 조용히 일어난다.

| 사고 | 어떻게 생기나 |
|---|---|
| 남의 테이블에 의존 | hr이 `dh.outreaches`를 직접 읽다가, dh가 컬럼을 바꾸면서 hr이 깨진다. dh 담당자는 hr이 읽는 줄 몰랐다. |
| 주인 없는 쓰기 | 두 앱이 같은 테이블을 각자 UPDATE해서, 정책을 바꿀 때 한쪽만 고치고 다른 쪽에 구멍이 남는다. |
| 정체불명 테이블 | 반년 뒤 `temp_list` 같은 테이블이 나오는데 누가 만들었는지, 지워도 되는지 아무도 모른다. |

이 문서의 규칙은 전부 저 세 가지를 막기 위한 것이다.

---

## 2. 스키마 구조

Postgres의 **스키마(schema)**로 앱별 영역을 나눈다. 테이블 이름 앞에 `dh_`, `hr_`을 붙이는 방식이 아니라, `dh.companies`처럼 진짜 네임스페이스를 쓴다.

```
Supabase Postgres (프로젝트 1개)
│
├── core   ← 세 앱이 공유하는 신원·회원 데이터.  소유자: portal
│           members, people_directory, signup_requests
│           ※ Data API에 노출하지 않는다 (§6.6)
│
├── dh     ← 대협봇 업무 데이터.                소유자: dh
│           companies, outreaches, cycles, ...
│           ※ 프론트 직접 조회를 위해 Data API에 노출 예정 (§6)
│
├── hr     ← 그핵드인 업무 데이터.              소유자: hr
│           스키마는 만들어져 있고 테이블은 아직 없다.
│           hr 담당자가 정의를 가져오면 채운다.
│
├── public ← 쓰지 않는다. 새 테이블을 여기 만들지 않는다.
└── auth   ← Supabase가 소유. 직접 건드리지 않는다.
```

**접두사가 아니라 스키마를 쓰는 이유**는 세 가지다.

1. 접두사는 규칙일 뿐이라 안 지켜도 아무도 모르지만, 스키마는 `GRANT`와 Data API 노출 설정으로 접근 자체를 제어할 수 있다 (§6, §11.3).
2. 소속이 이름에 섞여 들어가지 않는다. `dh.companies`는 dh 밖으로 나가면 `companies`라는 원래 이름을 유지한다.
3. Prisma 스키마 파일에서 `@@schema("dh")` 한 줄로 소속이 보인다.

### public 스키마를 비워두는 이유

Supabase는 기본적으로 `public`에 테이블을 만들고, Data API(PostgREST)도 기본값이 `public`이다. 그래서 `public`은 "아무 생각 없이 만든 테이블이 자동으로 인터넷에 노출될 수 있는 위치"다. 여기를 비워두면 그 사고 경로 자체가 없어진다.

노출 여부는 스키마 단위로 **의도적으로** 결정하고, 그 결정과 필수 조건을 §6에 적는다.

---

## 3. 소유권 규칙

### 원칙: 쓰는 쪽은 하나, 읽는 쪽은 여럿 (one writer, many readers)

모든 테이블에는 **소유 앱이 정확히 하나** 있다. 소유 앱만 그 테이블의 구조와 내용을 바꾼다.

| 대상 | 규칙 |
|---|---|
| **자기 스키마** (dh → `dh.*`) | 읽기·쓰기·구조 변경 전부 자유. 다른 앱에 알릴 필요 없음. |
| **`core` 스키마** | **읽기는 세 앱 모두 자유.** 쓰기는 §5의 제한을 따른다. 구조 변경은 portal 담당자 리뷰 필수. |
| **남의 업무 스키마** (dh ↔ hr) | **접근하지 않는다.** 읽기도 안 된다. 필요하면 §3.2를 따른다. |

여기서 "앱"은 프론트와 백엔드를 묶은 단위다. `apps/dh-frontend`가 `dh` 스키마를 읽는 건 자기 스키마 접근이라 문제없다 — 다만 브라우저에서 직접 읽는 것은 경로가 달라서 §6의 추가 규칙을 탄다.

### 3.1 왜 남의 업무 스키마는 읽기도 막나

읽기만 해도 **의존이 생기기 때문**이다. hr이 `dh.outreaches.work_stage`를 읽기 시작하면, dh는 그 컬럼을 자유롭게 못 바꾼다. 그런데 dh 담당자는 자기 스키마라고 생각하고 바꾼다. 읽기 의존은 아무 흔적을 안 남겨서 리뷰로도 안 잡힌다.

`core`가 예외인 이유는, 애초에 **공유하려고 만든 영역**이라 "남이 읽는다"가 전제이고 그래서 변경 시 리뷰를 강제하기 때문이다.

### 3.2 다른 앱의 업무 데이터가 정말 필요하면

억지로 참으라는 뜻은 아니다. 필요하면 아래 순서로 **합의된 통로**를 만든다.

1. **API로 받는다 (기본)** — 소유 앱이 endpoint를 열어준다. 계약이 명시적이고 변경 시 양쪽이 안다.
2. **읽기 전용 뷰를 소유 앱이 만들어준다** — 대량 조회라 API가 부담될 때. 소유 앱이 자기 스키마에 `dh.v_outreach_summary` 같은 뷰를 만들고, 그 뷰만 상대에게 연다. 내부 컬럼을 바꿔도 뷰만 유지하면 상대는 안 깨진다.
3. **공유 데이터라면 `core`로 올린다** — 두 앱이 모두 진짜로 필요한 데이터라면 애초에 업무 스키마에 있을 게 아니다. 소유권을 portal로 옮기고 `core`에 둔다.

어느 쪽이든 **상대 테이블을 직접 SELECT하는 것만은 하지 않는다.**

---

## 4. 데이터 딕셔너리

**DB 구조를 바꾸는 PR은 이 표를 같이 고친다.** (§0)

### core — 소유자: portal

| 테이블 | 내용 | 쓰기 | 읽기 | 개인정보 |
|---|---|---|---|---|
| `members` | 접근 허용 회원 화이트리스트. role·활성 여부 | portal (§5) | portal, dh, hr 백엔드 | 이메일, 이름 |
| `people_directory` | 노션 People DB에서 동기화한 "신뢰 이메일" 원장. 가입 시 본인 확인용 | portal | portal, dh, hr 백엔드 | 이메일, 기수, 이름 |
| `signup_requests` | 가입 신청 + OTP 상태. 수명이 짧은 레코드 | portal | portal | 이메일, OTP 해시 |

`core`는 어느 테이블도 브라우저에 직접 노출하지 않는다 (§6.6).

> `core`의 세 테이블을 쓰는 CLI(`members:add` / `members:remove` / `people:import`)는 전부 `apps/portal-backend/prisma/`에 있다 — 소유 앱과 일치한다.

### dh — 소유자: dh

| 테이블 | 내용 | 프론트 직접 조회 |
|---|---|---|
| `cycles`, `cycle_start_intents`, `search_runs` | 수주 차수와 탐색 실행 | 미정 |
| `companies`, `contacts`, `contact_endpoints`, `prelaunch_contacts` | 기업과 관계자 | **예정** (§6) |
| `outreaches` | 컨택 건 (기업당 1건) | **예정** (§6) |
| `templates`, `message_draft_revisions` | 템플릿과 초안 리비전 | 미정 |
| `sent_messages`, `responses` | 발송 기록과 응답 확인 | 미정 |
| `past_projects` | 과거 협업 이력 | 미정 |
| `jobs` | 비동기 작업 | 아니오 |
| `idempotency_keys` | 멱등성 키. `dh` 스키마 전용이며 portal 것과 별개다 (§4.1) | 아니오 |

"프론트 직접 조회" 칸은 실제로 열 때 **뷰 이름과 함께** 갱신한다. 프론트가 어느 데이터에 직접 닿는지가 곧 공격 표면이라, 이 칸이 보안 검토의 시작점이 된다.

### nut — 소유자: nut

NUT 내부 운영팀의 재무 데이터. `admin`/`acting` 백엔드 API가 소유하며, 프론트에서
Supabase Data API로 직접 노출하지 않는다. 현재 테이블은 다음과 같다.

| 테이블 | 내용 | 프론트 직접 조회 |
|---|---|---|
| `finance_periods` | 운영팀 임기·회계연도와 예산/실제 합계 | 아니오 |
| `finance_buckets` | 비과세 수익·과세 수익·손금산입/불산입 비용·세금 bucket | 아니오 |
| `budget_nodes`, `budget_parameters` | 엑셀 예산안의 대/중/소분류와 계산 파라미터 | 아니오 |
| `income_lines` | 진행안 수입 항목과 결산안 실제 수입 | 아니오 |
| `ledger_entries` | 회계 상세 행 | 아니오 |
| `accounting_details`, `accounting_summaries` | 프로젝트별·운영팀별 상세/요약 회계 | 아니오 |
| `tax_summaries` | 법인세·원천징수세·부가세 계산 결과 | 아니오 |
| `claims` | Slack 청구서 요청과 상태 | 아니오 |

모든 `nut` 테이블은 생성 마이그레이션에서 RLS를 활성화하고, 현재는 백엔드 API만
접근한다. 프론트 직접 조회를 열게 되면 `v_` 뷰와 `core.current_member_role()` 정책을
먼저 추가한다.

### hr — 소유자: hr

미정. hr 구현 시작 시 이 표를 채운다. 테이블을 만들 때마다 한 줄씩 추가한다.

### 4.1 `idempotency_keys`는 앱마다 따로 만든다

예전에는 portal과 dh가 **같은 물리 테이블**을 공유했는데, 이건 설계가 아니라 사고에 가까웠다. 이 테이블은 공유 도메인 데이터가 아니라 **각 앱의 내부 구현 디테일**이다(재시도 요청을 걸러내는 용도). 소유자가 없는 테이블이었고, 두 앱의 키가 한 네임스페이스에 섞여서 우연히 같은 `Idempotency-Key`를 받으면 남의 응답을 돌려줄 수 있었다.

지금은 스키마마다 자기 테이블을 갖는다 — **`core.idempotency_keys`(portal용) / `dh.idempotency_keys` / 나중에 `hr.idempotency_keys`**. 물리 테이블 이름은 `idempotency_keys`로 같고 스키마만 다르다(이게 multiSchema의 용도다). 각 앱의 `schema.prisma`에는 자기 것 하나만 `IdempotencyKey`라는 이름으로 선언하므로 앱 코드는 이 분리를 알 필요가 없다.

---

## 5. `members` 특별 규칙

`members`는 세 앱이 모두 만지는 유일한 테이블이라 별도로 정한다.

### 5.1 무엇을 누가 하나

| 동작 | 누가 | 비고 |
|---|---|---|
| **읽기** (`findUnique` 등) | portal, dh, hr **백엔드** 전부 | 요청마다 "이 사람이 명단에 있나"를 확인해야 하므로 직접 읽는다 |
| `role` 변경, `active` 변경, 행 생성·삭제 | **portal만** | 회원 관리 화면. dh/hr은 이 코드를 아예 갖지 않는다 |
| `last_login_at`, `supabase_user_id` 갱신 | 세 앱 전부 | 단, **`packages/auth` 공유 코드를 통해서만** (§5.2) |
| 브라우저에서 직접 조회 | **아무도 안 함** | 자기 정보는 `GET /api/v1/me`로 받는다 (§6.6) |

읽기를 막지 않는 이유는, 매 요청마다 portal에 HTTP를 한 번 더 날리면 느려지고 portal이 죽으면 dh·hr도 같이 죽기 때문이다. 3개 앱 규모에서 그 비용은 얻는 것보다 크다.

### 5.2 인증 로직은 한 벌만 존재한다

예전에는 `apps/dh-backend/src/lib/auth.ts`와 `apps/portal-backend/src/lib/auth.ts`의 `getAuthenticatedMember()`가 거의 같은 코드로 복사돼 있었다. hr까지 만들면 세 벌이 됐을 것이다. "회원이 비활성화되면 세션도 끊는다" 같은 정책을 추가할 때 **한 군데를 빠뜨리면 그 앱에만 구멍이 남고, 세 파일이 비슷하게 생겨서 리뷰로 안 잡힌다.**

그래서 인증 진입점은 `packages/auth`에 **한 벌만** 둔다.

```
packages/auth/  ← getAuthenticatedMember() 원본 1벌
      ↑              ↑              ↑
portal-backend   dh-backend    hr-backend
```

앱마다 다른 것 — Prisma 접근(생성 클라이언트가 앱마다 다르다), `ApiError`(에러 코드 집합이 다르다), 거부 대상 — 은 주입한다. 정책(검사 순서, 거부 조건, 최근 접속 갱신 시점)만 패키지가 갖는다.

```ts
// apps/dh-backend — alumni는 대협봇 접근 불가
export const getAuthenticatedMember = createGetAuthenticatedMember<Member>({
  findByEmail: (email) => prisma.member.findUnique({ where: { email } }),
  markLogin: (id, supabaseUserId) =>
    prisma.member.update({ where: { id }, data: { supabaseUserId, lastLoginAt: new Date() } }),
  toError: (code, message) => new ApiError(code, message),
  getSupabaseClient: getSupabaseAuthClient,
  deny: ["alumni"],
  messages: { /* 앱별 거부 문구 */ },
});

// apps/portal-backend — deny 없음. alumni도 /me로 자기 목적지를 알아야 한다.
```

**지켜야 하는 순서 계약이 하나 있다**: `deny`로 거부되는 계정이라도 최근 접속 기록은 **먼저** 남긴다. 관리자 명단 화면의 "최근 접속일"이 alumni에게도 의미 있으려면 그래야 한다. `packages/auth/src/member.test.ts`가 이 순서를 테스트로 고정해 뒀다.

**엄밀히 말하면 물리적 writer는 여전히 셋이다.** 완전한 "writer 하나"는 매 요청 HTTP 호출을 요구하는데(§5.1), 그 대신 **정책이 사는 곳을 하나로** 만들어서 실무 사고의 대부분을 막는 절충이다. 이 절충을 택했다는 걸 알고 쓴다 — 누군가 `packages/auth`를 우회해서 `prisma.member.update()`를 직접 부르면 규칙이 무너진다.

프론트가 테이블을 직접 조회하기 시작하면 **같은 권한 판정이 SQL 쪽에도 한 벌 생긴다.** 그쪽도 함수 하나로 모으는 게 §6.3이다.

### 5.3 `members`에 컬럼을 추가하고 싶을 때

dh나 hr이 자기 업무용 정보를 회원별로 저장하고 싶어도 **`core.members`에 컬럼을 추가하지 않는다.** 자기 스키마에 `member_id`를 참조하는 별도 테이블을 만든다.

```
core.members  ←─ 참조 ─  dh.member_preferences  (dh 소유)
              ←─ 참조 ─  hr.member_profiles     (hr 소유)
```

이렇게 하면 dh가 자기 컬럼을 마음대로 추가·삭제해도 portal·hr은 영향받지 않는다. `core.members`는 **세 앱이 모두 의미를 합의한 필드만** 갖는다.

FK 방향은 항상 **업무 스키마 → core**다. `core`에서 `dh`나 `hr`을 참조하는 FK는 만들지 않는다 — 공유 영역이 특정 앱에 의존하게 되면 그 앱 없이는 core를 못 고친다.

---

## 6. 프론트엔드에서 테이블 직접 조회하기

`apps/dh-frontend`가 기업 정보 등을 백엔드 API를 거치지 않고 `supabase.from()`으로 직접 읽는 것을 **예정하고 있다.** 아직 적용 전이지만(§12), 스키마를 나누는 지금 시점에 규칙을 정해둔다. 나중에 붙이면 이미 노출된 테이블을 되돌려야 해서 훨씬 비싸다.

### 6.0 무엇이 달라지나

지금은 모든 DB 접근이 백엔드를 거친다.

```
브라우저 → 백엔드 API → Prisma → Postgres
           └─ getAuthenticatedMember()가 여기서 검사:
              ① 명단에 있나  ② active인가  ③ alumni 아닌가
```

직접 조회는 백엔드가 빠진다.

```
브라우저 → PostgREST(Data API) → Postgres
           └─ 백엔드가 없으므로 위 세 가지 검사를 아무도 안 한다
```

그래서 **그 검사를 DB 안에서 다시 해야 한다.** 그게 RLS(Row Level Security)다. 즉 직접 조회를 켜는 순간 **권한 판정이 TypeScript와 SQL 두 곳에 존재**하게 되고, 둘이 어긋나면 그게 곧 보안 구멍이다. 이 섹션의 규칙은 전부 그 두 벌을 어긋나지 않게 관리하기 위한 것이다.

### 6.1 읽기만 직접, 쓰기는 반드시 API

| | 프론트 직접 (`supabase.from()`) | 백엔드 API |
|---|---|---|
| **읽기** (SELECT) | 허용 — 단 §6.2~6.4를 지킨다 | 계속 허용 |
| **쓰기** (INSERT/UPDATE/DELETE) | **금지** | **필수** |

쓰기에는 업무 규칙이 붙어 있기 때문이다. 동시 수정 방지(`version` 비교), 멱등성 키 처리, 차수 규칙, 워크플로 단계 전이, 발송 스냅샷 기록 — [정책 문서](../admin/policies.md)에 있는 규칙들이다. 이걸 RLS로 옮기는 건 사실상 불가능하고, 옮긴다 해도 업무 로직이 SQL에 흩어져서 아무도 못 고치는 상태가 된다.

**읽기만 빠른 길을 열고, 쓰기는 지금 구조 그대로 둔다.**

### 6.2 RLS를 안 켠 채 노출하면 그 테이블은 전 세계에 공개된다

가장 중요한 항목이다. Data API에 `dh` 스키마를 노출하는 순간:

- 그 스키마의 테이블은 **anon key만 있으면 누구나** PostgREST로 요청할 수 있다.
- anon key는 프론트 번들에 들어 있는 **공개된 값**이다. 비밀이 아니다.
- RLS를 켜지 않은 테이블은 **인터넷 전체에 공개된 것과 같다.**

그래서 다음을 규칙으로 못박는다.

> **노출한 스키마의 모든 테이블은 RLS를 켠다. RLS를 켜는 것은 테이블 생성 절차의 일부다 (§9.1).**

```sql
alter table dh.companies enable row level security;
```

**현재 `core`·`dh`의 19개 테이블은 전부 RLS가 켜져 있고 정책은 하나도 없다**
(`packages/db/migrations/20260923052424_enable_rls/`). 즉 비특권 역할에는 전부
거부다. 아직 노출한 스키마가 없어서 지금 달라지는 동작은 없지만, 나중에 열 때
테이블 하나를 빠뜨려 생기는 사고를 미리 막아둔 것이다. 앱은 영향받지 않는다 —
접속 역할 `postgres`가 `rolbypassrls`이고 모든 테이블의 소유자다.

RLS를 켜면 기본이 **전부 거부**다. 정책(policy)을 명시적으로 추가한 것만 통과한다. 새 테이블이 실수로 열려 있는 상태가 되지 않는 게 핵심이다.

`packages/db`의 마이그레이션에 RLS 활성화와 정책을 **같이** 넣는다. 대시보드에서 손으로 켜면 마이그레이션 파일과 실제 DB가 어긋나고(§10), 새 환경에 배포할 때 재현되지 않는다.

### 6.3 권한 판정은 함수 하나로 모은다 (RLS판 `packages/auth`)

정책을 테이블마다 따로 쓰면 §5.2에서 막으려던 문제가 SQL 쪽에서 똑같이 반복된다. 판정 로직은 `core`의 함수 하나에 모으고, 정책은 그 함수만 부른다.

```sql
-- 현재 요청자의 role을 돌려준다. 명단에 없거나 비활성이면 null.
-- SECURITY DEFINER: 호출자에게 core 접근 권한이 없어도 이 함수 안에서는 읽을 수 있다
--                   → core 스키마를 노출하지 않고도 판정이 가능하다 (§6.6)
create or replace function core.current_member_role()
returns text
language sql
stable
security definer
set search_path = core, pg_temp
as $$
  select role::text
  from core.members
  where email = (auth.jwt() ->> 'email')
    and active
  limit 1
$$;
```

이메일을 키로 쓰는 이유는 `members.email`이 이 프로젝트의 실제 화이트리스트 키이기 때문이다(`getAuthenticatedMember`도 이메일로 조회한다). `supabase_user_id`는 첫 로그인 전까지 `null`이라 판정 키로 쓰면 신규 회원이 막힌다.

정책은 이 함수만 부른다. 백엔드의 `deny: ["alumni"]`와 같은 규칙이 SQL로 표현된 것이다.

```sql
-- dh는 admin·acting만. alumni는 대협봇 접근 불가 (백엔드 규칙과 동일)
create policy dh_read_for_staff on dh.companies
  for select to authenticated
  using (core.current_member_role() in ('admin', 'acting'));
```

**`packages/auth`의 정책을 바꾸면 이 함수도 같이 본다.** 둘은 같은 규칙의 두 가지 구현이다 — 한쪽만 고치면 어긋난다.

### 6.4 프론트가 읽는 건 테이블이 아니라 뷰

프론트에 테이블을 그대로 열지 않고 `v_` 뷰를 만들어 그것만 연다. §3.2의 "뷰 = 계약" 원칙을 프론트에도 똑같이 적용하는 것이다.

```sql
create view dh.v_company_list
with (security_invoker = true)   -- ★ 반드시 필요
as select id, name, product, domain, created_at
   from dh.companies
   where not permanently_excluded;
```

두 가지 이유가 있다.

1. **컬럼을 고를 수 있다.** `permanently_excluded_reason` 같은 내부 메모를 브라우저로 내보내지 않는다.
2. **테이블 구조를 바꿔도 프론트가 안 깨진다.** 뷰만 유지하면 된다.

`security_invoker = true`를 빼면 뷰가 **소유자 권한으로 실행돼서 밑에 깔린 테이블의 RLS를 통째로 우회한다.** RLS를 열심히 걸어놓고 뷰로 전부 무력화하는 흔한 사고다. Supabase의 Postgres 15+에서 지원하므로 항상 붙인다.

### 6.5 프론트에서 쓰는 법

`supabase-js`는 기본적으로 `public` 스키마를 본다. 다른 스키마는 명시해야 한다.

```ts
// apps/dh-frontend
const { data, error } = await supabase
  .schema("dh")
  .from("v_company_list")
  .select("id, name, product, domain");
```

클라이언트를 만들 때 기본 스키마를 고정할 수도 있다.

```ts
export const dhDb = createClient(url, anonKey, { db: { schema: "dh" } });
```

`apps/dh-frontend/src/services/`의 repository 계층 안에서만 호출한다 — 화면 컴포넌트가 `supabase.from()`을 직접 부르면, 나중에 API 경유로 되돌리거나 뷰 이름을 바꿀 때 전부 뒤져야 한다. 지금 `outreachRepository.ts`가 샘플 데이터 어댑터를 감싸고 있는 구조를 그대로 유지한다.

### 6.6 `core`는 노출하지 않는다

회원 명단·이메일·기수·OTP 해시는 브라우저에서 직접 조회할 수 있게 열지 않는다. Data API의 Exposed schemas에 `core`를 넣지 않는다.

- 로그인한 본인의 정보는 `GET /api/v1/me`(portal)로 받는다. 이미 있는 경로다.
- 회원 명단은 admin 화면에서 portal API로 받는다. 이미 있는 경로다.
- RLS 정책이 `core.members`를 읽어야 하는 건 §6.3의 `SECURITY DEFINER` 함수가 해결한다 — **스키마를 노출하지 않아도 함수 안에서는 읽힌다.**

`people_directory`는 특히 주의한다. 학회원 전체의 이름·기수·이메일이 들어 있어서, 노출되면 한 번의 요청으로 전부 빠져나간다.

### 6.7 테이블을 프론트에 여는 절차

1. 읽을 컬럼만 담은 `v_` 뷰를 만든다 (`security_invoker = true`)
2. 밑에 깔린 **모든** 테이블에 RLS를 켜고 정책을 건다 (§6.2, §6.3)
3. `authenticated` role에 `usage`/`select` 권한을 준다

   ```sql
   grant usage on schema dh to authenticated;
   grant select on dh.v_company_list to authenticated;
   ```

   RLS는 행을 거르는 것이고 `GRANT`는 테이블에 닿을 수 있는지다 — **둘 다 필요하다.**
4. Dashboard → Project Settings → API → **Exposed schemas**에 스키마를 추가한다
5. **로그아웃 상태에서, 그리고 alumni 계정으로** 요청을 날려 거부되는지 직접 확인한다
6. §4 딕셔너리의 "프론트 직접 조회" 칸에 뷰 이름을 적는다

5번을 건너뛰지 않는다. RLS는 걸었다고 믿기 쉽고, 틀렸을 때 조용히 성공하는 종류의 실수다.

---

## 7. 마이그레이션은 `packages/db`가 소유한다

### 7.1 지금 구조의 문제

마이그레이션 SQL이 `apps/dh-backend/prisma/migrations/`에 있다. 즉 **DB 전체의 구조가 dh 앱 안에 들어 있다.** hr 담당자가 `hr.interviews` 테이블을 만들려면 `apps/dh-backend/prisma/schema.prisma`를 열어서 거기에 hr 테이블을 추가해야 한다. 앱을 나눈 의미가 사라진다.

### 7.2 바꿀 구조

DB 구조를 앱 밖, 중립 지대로 옮긴다.

```
packages/db/                              ← DB 구조의 유일한 원본
├── schema.prisma                         core + dh + hr 전부
├── migrations/                           apps/dh-backend에서 이동
└── sql/                                  RLS 정책·뷰·함수 (§6)

apps/portal-backend/prisma/schema.prisma  ← core만 선언
apps/dh-backend/prisma/schema.prisma      ← core + dh 선언
apps/hr-backend/prisma/schema.prisma      ← core + hr 선언
```

| 구분 | `packages/db` | 각 앱의 `prisma/` |
|---|---|---|
| 역할 | 물리 스키마의 원본 | "내가 쓰는 테이블 목록" |
| 실행하는 명령 | `prisma migrate dev` / `migrate deploy` | **`prisma generate`만** |
| 마이그레이션 파일 | 있음 | **없음** |

앱의 `schema.prisma`는 타입 생성용이다. 거기서 `migrate`를 돌리면 Prisma가 **자기가 모르는 테이블을 "지워야 할 것"으로 판단해서** DB를 망가뜨린다. 앱 디렉토리에는 `db:migrate` 스크립트 자체를 두지 않는다.

이건 새 발명이 아니다 — `apps/portal-backend`가 이미 이 방식으로 동작한다(스키마 파일 상단 주석에 "마이그레이션은 이 앱이 만들지 않는다"고 적혀 있다). 그 규칙을 dh에도 적용하고, 원본을 앱 밖으로 빼는 것뿐이다.

### 7.3 Prisma가 모르는 것들은 마이그레이션 SQL에 직접 쓴다

RLS 정책, 뷰, 함수, 부분 유니크 인덱스는 Prisma 스키마 문법으로 표현할 수 없다. 이것들은 `prisma migrate dev --create-only`로 빈 마이그레이션을 만든 뒤 SQL을 직접 써넣는다.

**대시보드에서 손으로 만들지 않는다.** 대시보드 변경은 마이그레이션 파일에 안 남아서, 나중에 DB를 다시 만들면 RLS 정책만 조용히 사라진다. 그 상태가 바로 §6.2의 "전 세계에 공개"다.

### 7.4 이력은 안 날아간다

마이그레이션 폴더는 `git mv`로 옮긴다. 어디까지 적용했는지는 DB 안의 `_prisma_migrations` 테이블이 갖고 있어서 **파일 위치와 무관하다.** 옮긴 뒤 `packages/db`에서 `prisma migrate status`를 돌려 "up to date"가 나오면 정상이다.

---

## 8. 네이밍 규칙

Postgres 쪽 이름은 전부 `snake_case`다. Prisma 모델은 camelCase로 쓰고 `@map` / `@@map`으로 연결한다 (현재 코드가 이미 이 방식이다).

| 대상 | 규칙 | 예 |
|---|---|---|
| 테이블 | 소문자 복수형 | `outreaches`, `members` |
| 컬럼 | 소문자 단수 | `display_name`, `work_stage` |
| 외래 키 | `<대상단수>_id` | `company_id`, `owner_id` |
| 시각 컬럼 | `_at` 접미사, `timestamptz` | `created_at`, `last_login_at` |
| 불리언 | 형용사 또는 `is_`/`has_` | `active`, `is_prelaunch_only` |
| 뷰 | `v_` 접두사 | `v_company_list` |
| RLS 정책 | `<스키마>_<동작>_<대상>` | `dh_read_for_staff` |
| enum | 소문자 단수, 값도 소문자 | `role`, `work_stage` |

- **PK는 `cuid()` 문자열**로 통일한다. 정수 자동증가는 쓰지 않는다 — 브라우저에 ID가 그대로 노출되는 구조(§6)에서 추측 가능한 순번은 피하는 게 낫고, 현재 모든 테이블이 이미 `cuid()`라 일관성도 유지된다.
- **삭제는 기본적으로 하지 않는다.** `active` 같은 플래그로 비활성화한다 (현재 `members`가 이 방식이다). 다른 앱이 참조하던 행이 사라지면 그 앱에서 원인 모를 오류가 난다.
- enum 값은 **추가만** 한다. 값을 지우거나 이름을 바꾸는 건 저장된 데이터를 무효화하므로 §9.2의 절차를 탄다.

---

## 9. 테이블을 추가·변경하는 절차

### 9.1 자기 스키마에 테이블을 추가할 때

1. `packages/db/schema.prisma`에 모델 추가, `@@schema("dh")` 명시
2. `packages/db`에서 `npx prisma migrate dev --name add_xxx`
3. **같은 마이그레이션에 RLS 활성화를 추가한다** (§6.2)

   ```sql
   alter table dh.xxx enable row level security;
   ```

   프론트에 열 계획이 없어도 켠다. 나중에 스키마를 노출할 때 이 테이블 하나가 빠져 있으면 그게 구멍이 된다.
4. 자기 앱의 `prisma/schema.prisma`에도 같은 모델 추가 → `npm run db:generate`
5. **§4 딕셔너리에 한 줄 추가**
6. PR (같은 스키마 안의 새 테이블이면 다른 앱 담당자 리뷰는 불필요)

### 9.2 공유 테이블(`core.*`)을 바꿀 때

읽는 앱이 여럿이므로 **한 번에 바꾸지 않는다.** 확장 후 축소(expand-contract) 방식으로 나눠 배포한다.

컬럼 이름을 `display_name` → `full_name`으로 바꾸는 경우:

```
1단계 (확장)    full_name 컬럼을 nullable로 추가            → 배포. 기존 앱 안 깨짐
2단계 (이중쓰기) 쓰는 코드가 두 컬럼 다 채우게 함             → 배포
3단계 (이전)    기존 데이터 복사, 읽는 앱들을 full_name으로 전환 → 앱마다 배포
4단계 (확인)    display_name을 읽는 코드가 없는지 확인
5단계 (축소)    display_name 삭제                          → 배포
```

번거로워 보이지만, 각 단계 사이에 어떤 앱이 아직 배포 전이어도 안 깨진다는 게 핵심이다. 세 앱이 각각 별도 Vercel 프로젝트로 배포되는 구조([라우팅 구조](../admin/routing.md))에서는 **세 앱이 동시에 새 코드가 되는 순간이 없다.** 한 번에 rename하면 배포 순서에 따라 반드시 누군가는 깨진다.

- 1·2단계는 portal 담당자 리뷰만 받으면 된다.
- **5단계(삭제)는 `core.*`를 읽는 모든 앱 담당자의 확인**을 받는다.

### 9.3 프론트가 직접 읽는 테이블을 바꿀 때

브라우저에 배포된 코드는 **되돌릴 수 없다.** 사용자가 열어둔 탭은 옛 코드 그대로 돈다. 그래서 `v_` 뷰의 컬럼을 지우거나 이름을 바꾸는 건 §9.2와 같은 단계를 밟는다. 뷰에 컬럼을 **추가**하는 건 안전하다.

밑에 깔린 테이블은 뷰만 유지하면 자유롭게 바꿔도 된다 — 그게 뷰를 쓰는 이유다 (§6.4).

### 9.4 `core`를 바꿀 때 누구에게 알리나

`core`를 읽는 앱은 현재 portal·dh이고, hr이 생기면 셋이 된다. **읽는 쪽이 누군지는 §4 딕셔너리의 "읽기" 칸이 정답이다.** 표가 최신이어야 이게 작동하므로 §0의 규칙이 중요하다.

`packages/db/`와 `packages/auth/`에는 GitHub `CODEOWNERS`로 리뷰어를 걸어두는 걸 권장한다 — 사람이 기억해서 리뷰를 요청하는 방식은 언젠가 반드시 빠진다.

---

## 10. 하면 안 되는 것

| 금지 | 이유 |
|---|---|
| **RLS를 안 켠 테이블이 있는 스키마를 Data API에 노출** | anon key는 공개된 값이라 그 테이블이 인터넷에 열린다 (§6.2) |
| **`core` 스키마를 Data API에 노출** | 학회원 전체 명단·이메일이 한 번에 빠져나간다 (§6.6) |
| **`security_invoker` 없는 뷰를 프론트에 노출** | 밑에 깔린 테이블의 RLS를 통째로 우회한다 (§6.4) |
| **프론트에서 직접 INSERT/UPDATE/DELETE** | 버전 검사·멱등성·업무 규칙을 전부 건너뛴다 (§6.1) |
| RLS 정책·뷰·함수를 대시보드에서 손으로 만들기 | 마이그레이션에 안 남아서 DB를 재생성하면 조용히 사라진다 (§7.3) |
| `public` 스키마에 새 테이블 만들기 | 소유자가 불분명하고, Data API 기본 노출 대상이다 |
| 다른 앱의 업무 스키마를 직접 SELECT | 보이지 않는 의존이 생긴다 (§3.1) |
| `apps/*` 안에서 `prisma migrate` 실행 | 앱 스키마는 DB 전체를 모른다 — 남의 테이블을 삭제 대상으로 판단한다 (§7.2) |
| `prisma db push` | 마이그레이션 이력 없이 DB를 바꾼다. 무엇이 왜 바뀌었는지 기록이 안 남는다 |
| `packages/auth`를 우회한 `member.update()` | 인증 정책이 다시 여러 벌이 된다 (§5.2) |
| `core.members`에 앱 전용 컬럼 추가 | 자기 스키마의 별도 테이블로 (§5.3) |
| `core` → `dh`/`hr` 방향 외래 키 | 공유 영역이 특정 앱에 의존하게 된다 (§5.3) |
| 운영 DB에 수동 SQL로 구조 변경 | 마이그레이션 파일과 실제 DB가 어긋나고(drift), 다음 배포가 예측 불가능해진다 |
| `service_role` 키를 프론트에 넣기 | RLS를 전부 무시하는 키다. 백엔드 환경변수로만 쓴다 |

---

## 11. 실제 설정 방법

### 11.1 Prisma에서 스키마 나누기

Prisma 5에서 `multiSchema`는 preview 기능이라 명시적으로 켜야 한다.

```prisma
// packages/db/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  schemas   = ["core", "dh", "hr"]
}

model Member {
  id    String @id @default(cuid())
  email String @unique
  // ...
  @@map("members")
  @@schema("core")   // ← 소속 스키마
}

enum Role {
  admin
  acting
  alumni
  @@schema("core")   // ← enum에도 필요하다. 빠뜨리기 쉬움
}
```

각 앱의 `schema.prisma`는 자기가 쓰는 스키마만 나열한다.

```prisma
// apps/dh-backend/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["core", "dh"]
}
```

생성 위치는 앱마다 다르게 유지한다(`output = "../src/generated/prisma"`). npm workspaces가 `@prisma/client`를 루트로 hoist하기 때문에, 같은 위치로 generate하면 나중에 실행한 앱이 다른 앱의 타입을 덮어쓴다. 현재 코드 주석에 이미 설명돼 있다.

### 11.2 접속 문자열

`_prisma_migrations` 테이블은 접속 문자열의 `schema` 파라미터가 가리키는 스키마에 생긴다. `packages/db`는 기본값(`public`)을 쓰고, 이 테이블 하나만 `public`에 남는다 — Prisma가 관리하는 것이라 §10의 "public에 테이블 만들지 않기"의 예외로 둔다. Data API에 `public`을 노출하지 않으므로 외부에서 보이지는 않는다.

기존 `DATABASE_URL`(포트 6543, transaction pooler)과 `DIRECT_URL`(포트 5432, session pooler)의 역할 구분은 그대로다. 각 앱 `.env.example`의 설명을 참고한다.

### 11.3 앱별 DB 계정 분리 — 아직 안 함

**백엔드 세 앱은 전부 같은 `postgres` 계정으로 접속한다.** 즉 §3의 소유권 규칙은 백엔드 쪽에서는 **문서로만 지켜지고 권한으로 강제되지 않는다.** hr 백엔드가 `dh.companies`를 SELECT해도 DB는 막지 않는다.

진짜로 강제하려면 앱별 DB role을 만들고 GRANT를 나눠야 한다.

```sql
-- 예시 (아직 적용 안 함)
CREATE ROLE hr_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA hr TO hr_app;
GRANT ALL ON ALL TABLES IN SCHEMA hr TO hr_app;
GRANT USAGE ON SCHEMA core TO hr_app;
GRANT SELECT ON ALL TABLES IN SCHEMA core TO hr_app;   -- 읽기만
-- dh 스키마는 아예 GRANT하지 않는다 → 접근 불가
```

세 명이 만드는 지금 규모에서는 문서 규칙으로 충분하다고 보지만, **팀이 커지거나 외부 기여자가 생기면 이걸 먼저 한다.**

다만 **프론트 직접 조회(§6)는 사정이 다르다.** 거기는 브라우저가 `authenticated` role로 붙기 때문에 RLS와 GRANT가 유일한 방어선이고, 문서 규칙으로 대신할 수 없다. §6의 항목들은 "나중에"가 아니라 노출과 동시에 적용한다.

---

## 12. 적용 현황과 남은 과제

**이 문서는 규칙을 먼저 정한 것이고, 코드는 아직 여기 맞춰져 있지 않다.** 지금 저장소를 열어보면 `packages/db`도 `packages/auth`도 없다. 리팩터링 진행에 따라 이 표를 갱신한다.

| 항목 | 상태 |
|---|---|
| `packages/db`로 마이그레이션 이전 | ✅ 완료 |
| `core`/`dh`/`hr` 스키마 분리 | ✅ 완료 (2026-09-23 운영 적용) |
| `idempotency_keys` 앱별 분리 | ✅ 완료 (2026-09-23 운영 적용) |
| `seed.ts`의 공유 테이블 파괴 문제 | ✅ 완료 — `members` 전삭제 제거, upsert로 전환 |
| `packages/auth` 공유 인증 | ✅ 완료 — 정책 1벌 + 테스트 10개 |
| `core` 쓰기 CLI를 portal로 이전 | ✅ 완료 — `members:add`/`members:remove`/`people:import` |
| 모든 테이블 RLS 활성화 (§6.2) | ✅ 완료 (2026-09-23) — core 4 + dh 15, 정책 없이 기본 거부 |
| `core.current_member_role()` 함수 (§6.3) | ❌ 프론트 직접 조회 시작 시 필요 |
| 프론트용 `v_` 뷰 + Data API 노출 (§6.7) | ❌ dh 프론트 실연결 시 |
| 앱별 DB role 분리 (GRANT) | ❌ 전부 `postgres` 계정 (§11.3 — 당장은 안 함) |
| `CODEOWNERS`로 리뷰어 강제 | ❌ |

스키마 분리와 `idempotency_keys` 분리는 `packages/db/migrations/20260923043603_split_schemas/`
한 마이그레이션으로 적용했다. 적용 전 전 테이블을 CSV로 백업했고, 적용 후 17개 테이블의
행 수가 백업과 모두 일치하는 것을 확인했다(`idempotency_keys`는 의도적으로 비웠다).

### 개발용 DB를 따로 두지 않는다 (결정)

Supabase 무료 플랜의 프로젝트 한도를 이미 다 써서, **개발과 운영이 같은 프로젝트·같은 DB를 본다.** 별도 개발 프로젝트는 만들지 않기로 했다.

대신 위험한 작업(스키마 분리처럼 전체 테이블을 옮기는 마이그레이션) 전에는 이렇게 한다.

1. **백업을 먼저 받는다.** `pg_dump`(또는 `supabase db dump`)로 스키마+데이터를 파일로 내려둔다. 이게 유일한 되돌리기 수단이다.
2. **로컬 Postgres에서 먼저 돌려본다.** Docker로 빈 Postgres를 띄우고 마이그레이션 전체를 적용해본다. Prisma는 어떤 Postgres에도 붙으므로 Supabase 프로젝트가 필요 없고, 비용도 슬롯도 들지 않는다.
3. **운영에는 검증된 마이그레이션만 `migrate deploy`로 적용한다.** 운영 DB에 대고 `migrate dev`를 돌리지 않는다 — 이 명령은 drift를 감지하면 DB를 초기화하려 든다.

### 미정 사항

- **hr 스키마의 테이블 목록** — hr 구현 시작 시 §4를 채운다.
- **hr이 dh 데이터를 필요로 하는지** — 지금은 없다고 보고 스키마를 완전히 격리했다. 필요해지면 §3.2의 통로를 만들고 이 문서를 고친다.
- **프론트 직접 조회의 적용 범위** — 우선 기업 목록 등 읽기 위주 화면부터 연다. 어느 뷰를 여는지는 §4 딕셔너리의 "프론트 직접 조회" 칸으로 관리한다.
