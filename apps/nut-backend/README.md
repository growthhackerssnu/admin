# NUT backend

NUT is an isolated Next.js API app for the `/nut` admin area. It validates the shared Supabase session and only permits `admin` and `acting` members. Finance data is read from the shared PostgreSQL `nut` schema.

The overview API reads the workbook-backed NUT finance snapshot from the shared PostgreSQL `nut` schema. It exposes 진행안 budget values, 결산안 actual values, Excel-style 잔액/차이 values, the imported ledger, and the persisted income lines. Budget-node, parameter, and ledger mutations are available under `/api/v1/finance` and require the existing admin/acting authentication path.

## Local development

```sh
cp .env.example .env.local
npm run dev
```

The API runs on `http://localhost:3003`:

```sh
curl http://localhost:3003/api/v1/ping
```

The finance data is available at:

```sh
curl http://localhost:3003/api/v1/finance/overview
```

Without a bearer token, `401` is expected. Use the same Supabase values and member whitelist as the other admin apps.

Do not run Prisma migrations from this folder. When NUT gets persistent tables, add them to `packages/db/schema.prisma`, migrate from `packages/db`, then copy only NUT's generated-client view here.

Mutation routes:

- `POST/PATCH/DELETE /api/v1/finance/budget-nodes`
- `PATCH /api/v1/finance/parameters`
- `POST/PATCH /api/v1/finance/ledger`

Every successful mutation returns the refreshed `FinanceOverview` contract. `remaining` is `budget - actual`; `variance` is `actual - budget`, so a positive expense variance means over budget.
