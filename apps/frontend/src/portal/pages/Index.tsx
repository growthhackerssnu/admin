import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { App as AntApp, Alert, Button, Skeleton, Typography } from "antd";
import {
  APP_LABEL,
  APP_PATH,
  reachableApps,
  type AppKey,
} from "@dhbot/ui-shell";
import { ApiClientError, getMe, type Me } from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

// acting/admin처럼 갈 수 있는 곳이 여럿인 role이 로그인 직후 도착하는 화면.
// "이 role이 갈 수 있는 곳" 목록은 SidePane과 똑같이 @dhbot/ui-shell의
// reachableApps()에서 가져온다 — 여기(고르는 화면)와 각 앱 안(갈아타는
// side pane)이 서로 다른 목록을 보여주면 안 되기 때문이다.
// 결정 배경: ARCHITECTURE_PORTAL.md §2, §3.1
export function Index() {
  const { message } = AntApp.useApp();
  const session = useSession();
  const navigate = useNavigate();

  const [me, setMe] = useState<Me>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        setMe(await getMe(session.access_token));
      } catch (e) {
        setError(
          e instanceof ApiClientError
            ? e.message
            : "계정 정보를 불러오지 못했습니다.",
        );
      }
    })();
  }, [session]);

  if (session === undefined || (session && !me && !error)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }
  if (session === null) return <Navigate to="/login" replace />;

  if (error || !me) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Alert
            type="error"
            showIcon
            message={error ?? "계정 정보를 불러오지 못했습니다."}
            action={<Button onClick={() => void signOut()}>로그아웃</Button>}
          />
        </div>
      </div>
    );
  }

  function goTo(app: AppKey) {
    navigate(APP_PATH[app]);
  }

  return (
    <div className="auth-page">
      <div className="auth-card stack">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            어디로 가시겠어요?
          </Typography.Title>
          <Typography.Text type="secondary">
            {me.displayName}님 ({me.role})
          </Typography.Text>
        </div>
        {reachableApps(me.role).map((app) => (
          <Button
            key={app}
            type="primary"
            block
            size="large"
            onClick={() => goTo(app)}
          >
            {APP_LABEL[app]} 접속
          </Button>
        ))}
        <Button block onClick={() => void signOut()}>
          로그아웃
        </Button>
      </div>
    </div>
  );
}
