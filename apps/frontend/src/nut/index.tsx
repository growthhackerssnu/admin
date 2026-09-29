import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidePane } from "@dhbot/ui-shell";
import { useSession } from "../lib/useSession";
import App from "./App";
import { fetchMe, type NutMember } from "./api";
import "./nut.css";

// /nut — 세션이 없으면 로그인으로 보내고, 회원 정보를 받아 화면 전환 패널을 붙인다.
export default function Nut() {
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
    <div className="app-shell">
      {member && <SidePane role={member.role} current="nut" />}
      <div className="nut-shell-main">
        <App member={member} />
      </div>
    </div>
  );
}
