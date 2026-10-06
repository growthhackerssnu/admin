import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, useAppRole } from "@/components/ui/app-shell";
import { useSession } from "../lib/useSession";
import { fetchMe, type NutMember } from "../nut/api";
import AttendancePage from "./AttendancePage";
import "../nut/nut.css";

// /attendance — NUT와 같은 회원 확인·반기·스타일을 쓰는 별도 화면. 세션이 없으면 로그인으로 보낸다.
export default function Attendance() {
  const role = useAppRole();
  const session = useSession();
  const navigate = useNavigate();
  const [member, setMember] = useState<NutMember>();

  useEffect(() => {
    if (session === null) navigate("/login", { replace: true });
    if (!session) return;
    fetchMe().then(setMember, () => undefined);
  }, [session, navigate]);

  if (!session) return null;
  return (
    <AppShell role={member?.role ?? role} current="attendance">
      <main>
        <AttendancePage />
      </main>
    </AppShell>
  );
}
