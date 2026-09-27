import { APP_LABEL, APP_PATH, reachableApps, type AppKey, type Role } from "./roleNav";

export type SidePaneProps = {
  /** 로그인한 사람의 권한. */
  role: Role;
  /** 지금 보고 있는 화면. 이 항목은 링크가 아니라 굵은 글씨로만 표시한다(눌러도 제자리라 링크로 만들 이유가 없다). */
  current: AppKey;
  /**
   * 항목을 눌렀을 때 실제로 이동할 주소를 결정하는 함수. 기본값은 상대
   * 경로(APP_PATH)를 그대로 쓰는데, 이건 운영 배포(gateway가 rewrite)
   * 기준이다. 로컬 개발처럼 앱마다 포트가 달라 절대 URL이 필요한 경우는
   * 이 값을 호출하는 쪽(각 앱)이 넘겨서 덮어쓴다.
   */
  hrefFor?: (app: AppKey) => string;
};

/**
 * "side pane"은 화면 한쪽에 붙어서 다른 화면(관리자/대협봇/그핵드인)으로
 * 곧장 넘어갈 수 있게 해주는 좁은 세로 패널이다. <a> 태그로 만든 이유: 지금은
 * dh/hr/admin이 전부 다른 앱(다른 Vite 프로젝트)이라 페이지를 통째로 새로
 * 불러와야 하고, 그래서 React Router의 <Link>(같은 앱 안에서만 되는
 * 클라이언트 이동)가 아니라 브라우저 기본 링크가 맞다.
 *
 * role이 alumni거나, 그 role이 갈 수 있는 곳이 하나(=자기 자신)뿐이면 아무것도
 * 그리지 않는다 — 전환할 다른 곳이 없으니 패널 자체가 의미 없다.
 */
export function SidePane({ role, current, hrefFor = (app) => APP_PATH[app] }: SidePaneProps) {
  const apps = reachableApps(role);
  if (role === "alumni" || apps.length <= 1) return null;

  return (
    <nav className="side-pane" aria-label="다른 화면으로 이동">
      {apps.map((app) =>
        app === current ? (
          <span key={app} className="side-pane-item side-pane-item-current">
            {APP_LABEL[app]}
          </span>
        ) : (
          <a key={app} className="side-pane-item" href={hrefFor(app)}>
            {APP_LABEL[app]}
          </a>
        ),
      )}
    </nav>
  );
}
