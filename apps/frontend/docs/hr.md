# 그핵드인 화면 (`src/hr`)

알럼나이 디렉토리. API는 `apps/backend`의 hr 도메인([backend/docs/hr.md](../../backend/docs/hr.md))을 호출한다. 실행·환경 변수·배포는 [apps/frontend/README.md](../README.md).

로그인·가입 UI는 없다 — 세션이 없으면 `/login`(portal)으로 보낸다. 모든 role(admin·acting·alumni)이 들어올 수 있다.

## 페이지

| 경로 | 파일 | 내용 |
|---|---|---|
| `/hr` | `pages/Directory.tsx` | 디렉토리. 실시간 검색 + 기수/직무계열/소속팀 패싯 필터, "내 프로필" 카드 고정(그리드에도 본인이 함께 나온다) |
| `/hr/people/:notionPageId` | `pages/ProfileDetail.tsx` | 프로필 상세. 본인 프로필이면 같은 화면에서 편집 모드로 전환해 수정 요청을 제출한다 |
| `/hr/requests` | `pages/MyRequests.tsx` | 내가 낸 수정 요청 이력(상태 무관), 반려 사유 포함. admin에게는 탭을 숨긴다 |
| `/hr/admin` | `pages/AdminQueue.tsx` | 수정 요청 승인 큐. admin만. 승인하면 Notion 페이지가 실제로 바뀐다 |

hr 안의 탭(디렉토리 ↔ 내 수정 요청 ↔ 승인 큐)은 `components/HrNav.tsx`, 다른 화면(관리자·대협봇·NUT)으로 가는 패널은 공유 `SidePane`이다. alumni에게는 SidePane이 보이지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `lib/api.ts` | hr API 클라이언트. "내 정보"는 `GET /api/v1/people/me`(portal의 `/api/v1/me`와 별개 — `{role, notionPageId}`) |
| `lib/directory.ts` | 패싯 계산·검색·정렬 |
| `lib/editRequestDisplay.ts` | 수정 요청 diff 요약 표시 |
| `components/` | `HrNav`, `EditRequestDiff`, `EditRequestStatusTag` |

## 관련 문서

- [hr 백엔드](../../backend/docs/hr.md)
- [라우팅 구조](../../../docs/admin/routing.md)
