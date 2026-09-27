import { useEffect, useState } from "react";
import { App as AntApp, Alert, Button, Skeleton, Typography } from "antd";
import { SidePane } from "@dhbot/ui-shell";
import { ApiClientError, getMe, type Me } from "../lib/api";
import { hrefForApp, loginHref } from "../lib/redirect";
import { useSession } from "../hooks/useSession";
import { signOut } from "../lib/supabase";

// 실제 디렉토리 화면(ARCHITECTURE.md §12.2)이 들어서기 전까지의 자리표시자다.
// 지금은 "로그인 확인 → role 조회 → side pane 표시"까지의 배관이 실제로
// 동작하는지 증명하는 용도 — hr-backend의 GET /api/v1/ping이 스캐폴딩
// 확인용 더미였던 것과 같은 역할이다. 첫 업무 화면(디렉토리)을 만들 때
// 이 파일 안의 내용을 그걸로 바꾸면 된다.
export function Home() {
  const session = useSession();
  const [me, setMe] = useState<Me>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (session === undefined) return; // 아직 세션 확인 중
    if (session === null) {
      window.location.href = loginHref();
      return;
    }
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

  if (session === undefined || session === null || (!me && !error)) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    );
  }

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

  return (
    <div className="app-shell">
      <SidePane role={me.role} current="hr" hrefFor={hrefForApp} />
      <main>
        <div className="row section-gap">
          <div>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>
              그핵드인
            </Typography.Title>
            <Typography.Text type="secondary">
              알럼나이 디렉토리 — 준비 중
            </Typography.Text>
          </div>
          <Button onClick={() => void signOut()}>로그아웃</Button>
        </div>
        <Alert
          type="info"
          showIcon
          message="디렉토리 화면은 다음 단계에서 구현됩니다."
        />
      </main>
    </div>
  );
}
