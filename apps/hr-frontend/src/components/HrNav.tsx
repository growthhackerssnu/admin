import { Link, useLocation } from "react-router-dom";
import "./HrNav.css";

// hr 내부 화면(디렉토리 ↔ 내 수정 요청)을 오가는 작은 탭. dh·hr·admin을
// 오가는 공유 SidePane(@dhbot/ui-shell)과는 완전히 별개다 — 그 컴포넌트는
// "역할별로 갈 수 있는 앱 목록"만 알아야 하는 단순한 것으로 유지하고, hr
// 안에서의 화면 전환은 hr-frontend 자체 코드로만 처리한다(ARCHITECTURE.md
// §12.1, 2026-09-28 결정 — 공유 패키지를 안 건드리므로 dh·portal 재빌드
// 없이 hr-frontend 안에서만 끝나는 변경).
const ITEMS = [
  { to: "/", label: "디렉토리" },
  { to: "/requests", label: "내 수정 요청" },
];

export function HrNav() {
  const { pathname } = useLocation();
  return (
    <nav className="hr-nav">
      {ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={pathname === item.to ? "hr-nav-item hr-nav-item-current" : "hr-nav-item"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
