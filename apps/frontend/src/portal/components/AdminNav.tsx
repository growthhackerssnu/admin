import { Link, useLocation } from "react-router-dom";
import "./AdminNav.css";

// 관리자 영역 안에서 회원 관리와 GH Bot API 키 발급을 오가는 탭.
// 그핵드인의 HrNav와 같은 상호작용·레이아웃을 사용하되, 메뉴의 소유권은
// portal에 둬서 HR 화면과 관리자 화면의 관심사를 섞지 않는다.
const ITEMS = [
  { to: "/admin", label: "회원 관리" },
  { to: "/admin/ghbot", label: "API 키 발급" },
];

export function AdminNav() {
  const { pathname } = useLocation();
  return (
    <nav className="admin-nav" aria-label="관리자 메뉴">
      {ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={
            pathname === item.to
              ? "admin-nav-item admin-nav-item-current"
              : "admin-nav-item"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
