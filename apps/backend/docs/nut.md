# nut domain (NUT finance)

API for the `/nut` finance workspace. Code lives in `src/nut`, routes in `app/api/v1/...`. UI: [frontend/docs/nut.md](../../frontend/docs/nut.md). Running, env vars and deployment: [apps/backend/README.md](../README.md).

It validates the shared Supabase session and only permits `admin` and `acting` members (`src/nut/lib/auth.ts` denies `alumni` with 403). Finance data lives in the shared PostgreSQL `nut` schema.

The overview API reads the workbook-backed NUT finance snapshot. It exposes 진행안 budget values, 결산안 actual values, Excel-style 잔액/차이 values, the imported ledger, and the persisted income lines.

## Routes

All require `Authorization: Bearer <Supabase access token>`; without it, `401` is expected.

- `GET /api/v1/ping` — the signed-in member (`{ ok, app, member: { id, displayName, role } }`). The frontend uses it for the side pane and the sidebar access card.
- `GET /api/v1/finance/overview`
- `POST/PATCH/DELETE /api/v1/finance/budget-nodes`
- `PATCH /api/v1/finance/parameters`
- `POST/PATCH /api/v1/finance/ledger`
- `GET/POST/PATCH/DELETE /api/v1/attendance` — 출석체크 기록과 사람별 벌점·벌금(`src/nut/lib/attendance.ts`). GET은 NUT 회원 전원, 쓰기는 회장단(`president`·`vice_president`)·총무·admin만.
- `POST/DELETE /api/v1/attendance/resets` — 벌점 초기화(분기마다). POST `{ through }`까지의 기록을 합계에서 빼고(기록은 남는다), DELETE는 가장 최근 초기화를 되돌린다.
- `PATCH /api/v1/attendance/rules` — 반기별 벌점·벌금 기준 한 칸(`<규칙 id>.points`·`<규칙 id>.fine`·`session-minutes`). 저장 안 한 값은 벌점벌금 시트의 기본값(`DEFAULT_RULES`).

### 출석체크 Slack 연결

'출석핑' 워크플로의 시트 단계 두 개를 GH NUT 앱의 커스텀 단계로 바꾼다(`slack-app/manifest.json`, `cd slack-app && slack install --app A0C802VMHK2`로 반영):

- 출석체크 양식 다음: **NUT에 출석 기록**(`record_roll_call`) — 프로젝트명과 네 명단(사유결석·사유지각·무단결석·무단지각)을 넣는다. 사유는 일단 벌점 없음으로 들어가고, 부분 사유는 화면에서 고친다.
- '몇 분 늦으셨나요?' 양식 다음: **NUT에 지각 시간 기록**(`record_late_arrival`) — 늦은 사람(버튼 누른 사람)과 분. 그날 그 사람의 결석·지각 기록에 시간을 채우고, 없으면 무단지각으로 만든다.

이름은 환급 계좌 명단에서 Slack 이메일로 찾는다. 날짜는 실행한 날(한국 시간)이다.

### 청구서 Slack 연결

청구서 워크플로의 **NUT에 청구서 등록**(`register_nut_claim`) 단계에 두 칸을 더 넣는다(둘 다 선택):

- `biz_card` — 양식의 '청구 종류?' 드롭다운. '학회카드 사용 후 내용 기록'(또는 '법인'·`true`)이면 법인카드(`prepaid: false`, 돌려줄 돈 없음), '개인카드 혹은 계좌이체 후 청구'거나 비우면 개인 카드(`prepaid: true`, 영수증 필요). 잘못 들어온 건 청구서 탭의 카드 칩을 눌러 바꾼다.
- `thread_link` — 영수증이 있는 Slack 메시지 링크. 이 단계 앞의 '메시지 보내기' 단계 출력인 '메시지 링크'를 넣는다. `https://*.slack.com/` 링크만 저장한다.

청구서·거래 내역·세금 탭의 '분류 확인'에 결제 수단과 스레드 링크가 보이고, 세금 탭에서 법인카드/개인 카드로 거를 수 있다.

Budget nodes carry a `billing` value: `every` (every half-year), `spring` / `fall` (counted only in a half-year starting Jan–Jun / Jul–Dec; otherwise `budget` is 0 but `amount` keeps the item's own value), or `once` (not copied by `POST /periods`). A new period starts with an opening balance of 0 — the previous balance comes in as a '잔금' income line. Until a period starts and has ledger rows, `carriedCash` reports the previous period's balance.

Every successful mutation returns the refreshed `FinanceOverview` contract. `remaining` is `budget - actual`; `variance` is `actual - budget`, so a positive expense variance means over budget.

```sh
curl http://localhost:3000/api/v1/finance/overview -H "Authorization: Bearer <token>"
```

## Schema changes

Add models to `packages/db/schema.prisma` with `@@schema("nut")`, migrate from `packages/db`, then run `npm run db:generate -w apps/backend`. Never run `prisma migrate` from `apps/backend`.
