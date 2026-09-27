# hr-frontend (그핵드인)

알럼나이 디렉토리 프론트엔드. **뼈대만 있고 실제 화면은 아직 없다** — `src/pages/Home.tsx` 하나뿐이고, 그건 "로그인 세션 확인 → hr-backend의 `GET /api/v1/me`로 role 조회 → side pane 표시"까지의 배관이 실제로 동작하는지 확인하는 자리표시자다. 첫 업무 화면(디렉토리, `ARCHITECTURE.md` §12.2)을 만들 때 이 파일 내용을 그걸로 바꾸면 된다.

로그인/가입 UI는 없다 — `apps/portal-frontend`가 전담한다(`ARCHITECTURE.md` §3.1). 세션이 없으면 portal의 로그인 화면으로 보낸다.

## 준비

```sh
npm install                      # 저장소 루트에서
cp .env.example .env.local       # 값은 apps/portal-backend/.env.local과 같은 Supabase 프로젝트
npm run dev                      # http://localhost:5175
```

hr-backend(`http://localhost:3002`)가 먼저 떠 있어야 한다. 로그인은 portal(`http://localhost:5174`)에서 하고, 발급된 Supabase 세션을 이 앱이 그대로 읽는다(같은 Supabase 프로젝트를 바라보므로).

| 앱 | 로컬 포트 |
|---|---|
| `apps/portal-frontend` | 5174 |
| `apps/dh-frontend` | 5173 |
| **`apps/hr-frontend`** | **5175** |
| `apps/hr-backend` | 3002 |

## 들어 있는 것

| 파일 | 내용 |
|---|---|
| `src/lib/supabase.ts` | Supabase 클라이언트. 로그인은 안 하고 세션만 읽는다 |
| `src/hooks/useSession.ts` | 현재 세션(undefined=로딩/null=비로그인/Session) |
| `src/lib/api.ts` | hr-backend 호출 클라이언트. `getMe()`만 있음(portal-frontend `src/lib/api.ts`와 같은 패턴) |
| `src/lib/redirect.ts` | side pane·로그인 리다이렉트가 실제로 이동할 주소 결정(로컬 개발 포트 오버라이드 포함) |
| `src/pages/Home.tsx` | 스캐폴딩 확인용 자리표시자. 지워도 되는 파일은 아니고, **내용을 디렉토리 화면으로 바꿔가는** 파일 |

`packages/ui-shell`의 `SidePane`/`reachableApps`(dh·hr·admin 전환, role별 목록)를 그대로 재사용한다 — `ARCHITECTURE_PORTAL.md` §3 참고.

## 아직 정해지지 않은 것 / 다음 단계

- **첫 업무 화면(디렉토리)** — `ARCHITECTURE.md` §12.1~12.2. `hr.people_cache["list"]`를 hr-backend가 채워줘야 붙일 수 있다.
- **gateway 경유 시 basename(`/hr`) 필요 여부** — dh-frontend와 같은 이슈(`ISSUE_dh-frontend-routing.md`), 첫 실제 gateway 배포 때 직접 확인해야 한다(`ARCHITECTURE.md` §3.1, §10). 지금은 dh/portal과 동일하게 basename 없이 둠.

## 관련 문서

- [hr 아키텍처](../../../ARCHITECTURE.md) — 화면 설계, API, 인증
- [hr-backend](../hr-backend/README.md) — 이 앱이 호출하는 API
- [portal 아키텍처](../../../ARCHITECTURE_PORTAL.md) — index 선택 화면, side pane 설계
