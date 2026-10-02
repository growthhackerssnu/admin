# frontend

`admin.ghsnu.com` 전체를 담당하는 단일 Vite + React SPA. 라우터·Supabase 클라이언트·Ant Design 설정이 하나라 화면 간 이동에 새로고침이 없고 로그인 상태도 그대로 유지된다.

| 경로 | 화면 | 코드 | 상세 |
|---|---|---|---|
| `/`, `/login`, `/index`, `/admin` | 로그인·가입(OTP)·앱 선택·회원 관리 | `src/portal` | [docs/portal.md](docs/portal.md) |
| `/dh`, `/dh/listup` | 사람 검토 화면(현재 샘플 데이터). `/dh/listup`은 `/dh`로 이동 | `src/dh/listup/review` | [docs/dh.md](docs/dh.md) |
| `/hr`, `/hr/people/:id`, `/hr/requests`, `/hr/admin` | 그핵드인 | `src/hr` | [docs/hr.md](docs/hr.md) |
| `/nut` | NUT 재무 | `src/nut` | [docs/nut.md](docs/nut.md) |

공유 모듈: `src/lib/supabase.ts`(클라이언트·로그인·로그아웃), `src/lib/useSession.ts`. 라우트 정의는 `src/main.tsx` 한 곳이고, dh·hr·nut은 처음 들어갈 때만 불러온다(lazy). 화면 간 이동 패널은 `@dhbot/ui-shell`의 `SidePane`.

`docs/*.md`는 합치기 전 앱별 README다. 화면·업무 설명은 유효하지만, 포트·실행 방법 등은 이 문서가 기준이다.

## 로컬

```sh
cp .env.example .env.local        # 값은 아래 "환경 변수" 참고
npm install                       # 저장소 루트에서
npm run dev -w apps/frontend      # http://localhost:5173
npm test -w apps/frontend
```

백엔드는 `npm run dev -w apps/backend`(http://localhost:3000).

## 환경 변수

| 이름 | 값 | 어디서 |
|---|---|---|
| `VITE_API_BASE_URL` | 운영 `https://api.ghsnu.com`, 로컬 `http://localhost:3000` | — |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public 키 | 같은 화면 → Project API keys → `anon` `public` |

브라우저에 그대로 노출되는 값이다. `service_role` 키나 DB 접속 문자열은 절대 넣지 않는다.

## Vercel 배포

루트 `vercel.json`이 빌드 명령·출력 폴더·SPA fallback을 정의한다.

1. Vercel에서 이 저장소로 프로젝트를 만든다. **Root Directory는 비워 둔다**(저장소 루트) — npm workspaces(`@dhbot/ui-shell`)를 설치해야 하기 때문이다.
2. Environment Variables에 위 세 값을 넣는다(Production 기준 `VITE_API_BASE_URL=https://api.ghsnu.com`).
3. Domains에 `admin.ghsnu.com`을 연결한다.
4. Supabase Dashboard → Authentication → URL Configuration에서 Site URL을 `https://admin.ghsnu.com`, Redirect URLs에 `https://admin.ghsnu.com`과 `http://localhost:5173`을 등록한다(Google 로그인 복귀 주소).
