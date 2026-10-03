import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, useAppRole } from "@/components/ui/app-shell";
import { useSession } from "../lib/useSession";
import App from "./App";
import { fetchMe, type NutMember } from "./api";
import "../hr/components/HrNav.css";
import "./nut.css";

// /nut — 세션이 없으면 로그인으로 보내고, 회원 role을 받아 화면 전환 패널을 붙인다.
// 테마·폰트는 그핵드인·관리자와 같은 HrLayout(main.tsx의 레이아웃 라우트)이 입힌다.
export default function Nut() {
  const role = useAppRole();
  const session = useSession();
  const navigate = useNavigate();
  const [member, setMember] = useState<NutMember>();

  useEffect(() => {
    if (session === null) navigate("/login", { replace: true });
    if (!session) return;
    // 실패(권한 없음 등)는 App이 overview 조회 오류로 그대로 보여준다.
    fetchMe().then(setMember, () => undefined);
  }, [session, navigate]);

  if (!session) return null;
  return (
    <AppShell role={member?.role ?? role} current="nut">
      <main>
        <App />
      </main>
    </AppShell>
  );
}
