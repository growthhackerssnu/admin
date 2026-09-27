# NUT frontend

The NUT finance workspace for `admin.ghsnu.com/nut`. It is a standalone Vite app with its own API client and UI styling. The production app should be deployed separately and mounted by the gateway at `/nut`.

The UI is intentionally limited to the required finance surfaces: 예산·결산 and 회계 시트. It reads the backend contract, shows 진행안 budget and 결산안 actual values separately, and displays Excel-style 잔액/차이 values. Bucket, parameter, and ledger changes are persisted through the backend mutation API.

## Local development

```sh
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5176`. The app calls `http://localhost:3003` by default. If the API is unavailable, the UI shows the connection error and does not substitute mock numbers.
