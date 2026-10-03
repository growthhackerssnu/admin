import { AppButton as Button } from "@/components/ui/app-button";
import { AppRoleContext } from "@/components/ui/app-shell";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Skeleton, Space } from "antd";
import { APP_LABEL, reachableApps, type AppKey } from "@dhbot/ui-shell";
import { ApiClientError, getMe, type Me } from "../lib/api";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

// 화면 접근 가드. 로그인한 계정의 role이 이 화면(app)에 들어갈 수 있는지
// `reachableApps(role)`(SidePane·index 화면과 같은 유일한 소스)로 확인하고,
// 못 들어가면 안내 메시지와 "그핵드인으로 이동" 버튼을 보여준다(/admin 가드와 같은 톤).
//
// 이 가드는 "화면 껍데기"를 막는 UX용이다. 데이터 자체는 백엔드가 이미 role별로
// 막고 있다(예: alumni는 dh API가 403) — 주소창에 /dh를 직접 쳐서 들어와도
// 데이터는 못 보지만, 화면이 그냥 열리면 혼란스러우니 여기서 안내한다.
export function RequireApp({
  app,
  children,
}: {
  app: AppKey;
  children: ReactNode;
}) {
  const session = useSession();
  const navigate = useNavigate();
  const [me, setMe] = useState<Me>();
  const [error, setError] = useState<string>();

  const token = session?.access_token;
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        setMe(await getMe(token));
      } catch (e) {
        setError(
          e instanceof ApiClientError
            ? e.message
            : "계정 정보를 불러오지 못했습니다.",
        );
      }
    })();
  }, [token]);

  if (session === null) return <Navigate to="/login" replace />;

  if (session === undefined || (!me && !error)) {
    return (
      <main>
        <Skeleton active paragraph={{ rows: 6 }} />
      </main>
    );
  }

  if (error || !me) {
    return (
      <main>
        <Alert
          type="error"
          showIcon
          message={error ?? "계정 정보를 불러오지 못했습니다."}
          action={<Button onClick={() => void signOut()}>로그아웃</Button>}
        />
      </main>
    );
  }

  if (!reachableApps(me.role).includes(app)) {
    return (
      <main>
        <Alert
          type="error"
          showIcon
          message="접근 권한이 없습니다"
          description={`${APP_LABEL[app]}은(는) 이 계정으로 이용할 수 없습니다. 그핵드인은 이용하실 수 있어요.`}
          action={
            <Space>
              <Button
                type="primary"
                onClick={() => navigate("/hr", { replace: true })}
              >
                그핵드인으로 이동
              </Button>
              <Button onClick={() => void signOut()}>로그아웃</Button>
            </Space>
          }
        />
      </main>
    );
  }

  return (
    <AppRoleContext.Provider value={me.role}>
      {children}
    </AppRoleContext.Provider>
  );
}
