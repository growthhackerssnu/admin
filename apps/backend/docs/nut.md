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

Every successful mutation returns the refreshed `FinanceOverview` contract. `remaining` is `budget - actual`; `variance` is `actual - budget`, so a positive expense variance means over budget.

```sh
curl http://localhost:3000/api/v1/finance/overview -H "Authorization: Bearer <token>"
```

## Schema changes

Add models to `packages/db/schema.prisma` with `@@schema("nut")`, migrate from `packages/db`, then run `npm run db:generate -w apps/backend`. Never run `prisma migrate` from `apps/backend`.
