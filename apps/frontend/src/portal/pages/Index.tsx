import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert, Button } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import {
  APP_LABEL,
  APP_PATH,
  reachableApps,
  type AppKey,
} from "@dhbot/ui-shell";
import { ApiClientError, getMe, type Me } from "../lib/api";
import { AuthLoading, AuthStage } from "../components/AuthStage";
import { useSession } from "../../lib/useSession";
import { signOut } from "../../lib/supabase";

// acting/admin처럼 갈 수 있는 곳이 여럿인 role이 로그인 직후 도착하는 화면.
// "이 role이 갈 수 있는 곳" 목록은 SidePane과 똑같이 @dhbot/ui-shell의
// reachableApps()에서 가져온다 — 여기(고르는 화면)와 각 앱 안(갈아타는
// side pane)이 서로 다른 목록을 보여주면 안 되기 때문이다.
// 결정 배경: ARCHITECTURE_PORTAL.md §2, §3.1
//
// 모양: 갈 수 있는 곳마다 화면을 3~4등분하는 큼직한 둥근 타일(2026-10-02).
// 타일 색은 브랜드 팔레트(lib/brand.ts)에서 앱마다 고정해서, 어느 role로 들어와도
// 같은 앱은 같은 색이다. 설명 문구는 초안이다.
const TILE: Record<
  AppKey,
  { en: string; desc: string; bg: string; tone: "dark" | "light" }
> = {
  admin: {
    en: "ADMIN",
    desc: "회원 관리·권한 설정",
    bg: "#ccdcff",
    tone: "light",
  },
  dh: {
    en: "DH BOT",
    desc: "기업 리스트업·컨택 업무",
    bg: "#152f69",
    tone: "dark",
  },
  hr: {
    en: "GH-IN",
    desc: "알럼나이 디렉토리·프로필",
    bg: "#3e5c9c",
    tone: "dark",
  },
  nut: { en: "NUT", desc: "재무·운영 현황", bg: "#7c96cf", tone: "light" },
};

const ROLE_LABEL: Record<Me["role"], string> = {
  admin: "ADMIN",
  acting: "ACTING",
  alumni: "ALUMNI",
};

function CenteredStage({ children }: { children: React.ReactNode }) {
  return (
    <AuthStage>
      <div className="auth-center">
        <div className="login-card">
          <div className="login-card-body">{children}</div>
        </div>
      </div>
    </AuthStage>
  );
}

export function Index() {
  const session = useSession();

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
      <AuthStage>
        <AuthLoading />
      </AuthStage>
    );
  }
  if (session === null) return <Navigate to="/login" replace />;

  if (error || !me) {
    return (
      <CenteredStage>
        <Alert
          type="error"
          showIcon
          message={error ?? "계정 정보를 불러오지 못했습니다."}
          action={<Button onClick={() => void signOut()}>로그아웃</Button>}
        />
      </CenteredStage>
    );
  }

  const apps = reachableApps(me.role);

  return (
    <AuthStage>
      <div className="index-layout">
        <div className="index-head">
          <div>
            <span className="index-role-chip">{ROLE_LABEL[me.role]}</span>
            <h1>어디로 가시겠어요?</h1>
            <p>{me.displayName}님, 안녕하세요.</p>
          </div>
          <Button className="index-logout" onClick={() => void signOut()}>
            로그아웃
          </Button>
        </div>

        <nav
          className={`index-tiles index-tiles-${apps.length}`}
          aria-label="이동할 화면"
        >
          {apps.map((app, i) => {
            const tile = TILE[app];
            return (
              <Link
                key={app}
                to={APP_PATH[app]}
                className={`index-tile index-tile-${tile.tone}`}
                style={{
                  background: tile.bg,
                  color: tile.tone === "dark" ? "#fff" : "#001136",
                }}
              >
                <div className="index-tile-top">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{tile.en}</span>
                </div>
                <div className="index-tile-bottom">
                  <div>
                    <div className="index-tile-name">{APP_LABEL[app]}</div>
                    <div className="index-tile-desc">{tile.desc}</div>
                  </div>
                  <span className="index-tile-arrow" aria-hidden="true">
                    <ArrowRightOutlined />
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </AuthStage>
  );
}
