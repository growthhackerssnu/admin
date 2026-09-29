import { Link } from "react-router-dom";
import { APP_LABEL, APP_PATH, reachableApps, type AppKey, type Role } from "./roleNav";

export type SidePaneProps = {
  /** 로그인한 사람의 권한. */
  role: Role;
  /** 지금 보고 있는 화면. 이 항목은 링크가 아니라 굵은 글씨로만 표시한다(눌러도 제자리라 링크로 만들 이유가 없다). */
  current: AppKey;
};

/**
 * "side pane"은 화면 한쪽에 붙어서 다른 화면(관리자/대협봇/그핵드인)으로
 * 곧장 넘어갈 수 있게 해주는 좁은 세로 패널이다. 모든 화면이 apps/frontend
 * 한 앱 안에 있으므로 React Router의 <Link>로 새로고침 없이 이동한다.
 *
 * role이 alumni거나, 그 role이 갈 수 있는 곳이 하나(=자기 자신)뿐이면 아무것도
 * 그리지 않는다 — 전환할 다른 곳이 없으니 패널 자체가 의미 없다.
 */
export function SidePane({ role, current }: SidePaneProps) {
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
          <Link key={app} className="side-pane-item" to={APP_PATH[app]}>
            {APP_LABEL[app]}
          </Link>
        ),
      )}
    </nav>
  );
}
