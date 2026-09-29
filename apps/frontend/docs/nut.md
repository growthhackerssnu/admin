# NUT 화면 (`src/nut`)

`admin.ghsnu.com/nut`의 재무 워크스페이스. admin·acting 전용이다(백엔드가 alumni를 403으로 막고, 화면 전환 목록에도 alumni에겐 나오지 않는다). API는 `apps/backend`의 nut 도메인([backend/docs/nut.md](../../backend/docs/nut.md)). 실행·환경 변수·배포는 [apps/frontend/README.md](../README.md).

화면은 필요한 재무 영역인 예산·결산과 회계 시트로 한정했다. 진행안 예산과 결산안 실적을 나눠 보여주고, 엑셀과 같은 방식의 잔액·차이 값을 표시한다. 버킷·파라미터·원장 변경은 백엔드 변경 API로 저장된다. API에 연결되지 않으면 연결 오류를 보여주고 가짜 숫자로 대신 채우지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `index.tsx` | `/nut` 진입점. 세션이 없으면 `/login`으로 보내고, `GET /api/v1/ping`으로 회원(이름·role)을 받아 공유 `SidePane`과 사이드바 ACCESS 카드에 쓴다 |
| `App.tsx` | 재무 화면 본체(예산·결산, 회계 시트) |
| `api.ts` | NUT API 클라이언트(`fetchMe`, `fetchOverview`, 변경 API) |
| `types.ts` | `FinanceOverview` 등 응답 타입 |
| `nut.css` | NUT 전용 스타일. 전역 선택자(`body` 등)는 쓰지 않는다 — 한 페이지에 다른 화면 CSS와 같이 로드되기 때문 |
