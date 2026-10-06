// 로그인한 사람의 권한(role)에 따라 이동할 수 있는 화면 목록을 정의한다.
//
// 이 목록은 두 군데서 그대로 재사용된다 — ①로그인 직후 "어디로 갈지 고르는"
// index 화면(apps/frontend/src/portal), ②각 화면 안에서 "다른 화면으로 갈아타는" side
// pane(SidePane.tsx). "이 role이 갈 수 있는 곳이 어디냐"는 같은 질문이라서
// 답도 한 곳(이 파일)에만 있어야 두 화면이 서로 어긋나지 않는다.
// 결정 배경: ARCHITECTURE_PORTAL.md §2, §3.1

/** core.members.role과 값이 같다(@dhbot/auth의 AuthRole 참고). */
export type Role = "admin" | "acting" | "alumni";

/** admin.ghsnu.com 아래에서 role별로 오갈 수 있는 화면. */
export type AppKey = "admin" | "dh" | "hr" | "nut" | "attendance";

/**
 * 각 화면의 경로. 전부 apps/frontend 한 앱의 라우트다.
 */
export const APP_PATH: Record<AppKey, string> = {
  admin: "/admin",
  dh: "/dh",
  hr: "/hr",
  nut: "/nut",
  attendance: "/attendance",
};

export const APP_LABEL: Record<AppKey, string> = {
  admin: "관리자",
  dh: "대협봇",
  hr: "그핵드인",
  nut: "NUT",
  attendance: "출석체크",
};

/**
 * role별로 갈 수 있는 화면 목록. 배열 순서가 곧 화면(index/side pane)에
 * 나열되는 순서다. NUT·출석체크는 admin·acting 전용이다(백엔드도
 * apps/backend/src/nut/lib/auth.ts에서 alumni를 막는다).
 *
 * alumni는 갈 곳이 hr 하나뿐이라 "고르는 화면"이나 "갈아타는 패널" 자체가
 * 필요 없다 — 그래서 호출하는 쪽(Login.tsx, SidePane)이 role === "alumni"를
 * 먼저 확인해서 이 함수를 아예 안 부르거나, 결과를 무시하고 곧장 /hr로 보낸다.
 * 그래도 이 함수는 모든 role에 대해 항상 값을 돌려주도록 만들어서(부분함수로
 * 안 만듦), "혹시 빠뜨린 role이 있나" 걱정할 필요가 없게 했다.
 */
export function reachableApps(role: Role): AppKey[] {
  if (role === "admin") return ["admin", "dh", "hr", "nut", "attendance"];
  if (role === "acting") return ["dh", "hr", "nut", "attendance"];
  return ["hr"];
}
