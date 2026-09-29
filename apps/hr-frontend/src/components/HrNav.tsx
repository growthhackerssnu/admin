import { Link, useLocation } from "react-router-dom";
import type { Me } from "../lib/api";
import "./HrNav.css";

// hr 내부 화면(디렉토리 ↔ 내 수정 요청 ↔ 승인 큐)을 오가는 작은 탭. dh·hr·admin을
// 오가는 공유 SidePane(@dhbot/ui-shell)과는 완전히 별개다 — 그 컴포넌트는
// "역할별로 갈 수 있는 앱 목록"만 알아야 하는 단순한 것으로 유지하고, hr
// 안에서의 화면 전환은 hr-frontend 자체 코드로만 처리한다(ARCHITECTURE.md
// §12.1, 2026-09-28 결정 — 공유 패키지를 안 건드리므로 dh·portal 재빌드
// 없이 hr-frontend 안에서만 끝나는 변경).
const DIRECTORY_ITEM = { to: "/", label: "디렉토리" };
const MY_REQUESTS_ITEM = { to: "/requests", label: "내 수정 요청" };
const ADMIN_ITEM = { to: "/admin", label: "승인 큐" };

export function HrNav({ role }: { role: Me["role"] }) {
  const { pathname } = useLocation();
  // admin은 CLI로 바로 만들어져 가입(claim) 절차를 거치지 않는 게 보통이라
  // 본인 프로필 자체가 없고, "내 수정 요청"이 항상 비어있는 화면이 된다 —
  // 그래서 admin에게는 이 탭을 아예 숨긴다(2026-09-28 결정, 사용자 확인).
  const items = role === "admin" ? [DIRECTORY_ITEM, ADMIN_ITEM] : [DIRECTORY_ITEM, MY_REQUESTS_ITEM];
  return (
    <nav className="hr-nav">
      {items.map((item) => (
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
