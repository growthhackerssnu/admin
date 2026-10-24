import { AppButton as Button } from "@/components/ui/app-button";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Alert } from "antd";
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
// 모양: 짙은 남색 무대 위에 갈 수 있는 곳마다 큼직한 둥근 타일(2026-10-02 브랜드 테마를
// 되살림). 타일 색은 디자인 시스템 브랜드 램프(--ds-brand-*)에서 앱마다 고정해서, 어느
// role로 들어와도 같은 앱은 같은 색이다. 설명 문구는 초안이다.
const TILE: Record<
  AppKey,
  { en: string; desc: string; bg: string; tone: "dark" | "light" }
> = {
  admin: {
    en: "ADMIN",
    desc: "회원 관리·권한 설정",
    bg: "var(--ds-brand-800)",
    tone: "light",
  },
  dh: {
    en: "DH BOT",
    desc: "기업 리스트업·컨택 업무",
    bg: "var(--ds-brand-200)",
    tone: "dark",
  },
  hr: {
    en: "GHedIn",
    desc: "알럼나이 디렉토리·프로필",
    bg: "var(--ds-brand-400)",
    tone: "dark",
  },
  projects: {
    en: "PROJECTS",
    desc: "그핵 프로젝트 백서",
    bg: "var(--ds-brand-700)",
    tone: "light",
  },
  nut: {
    en: "NUT",
    desc: "재무·운영 현황",
    bg: "var(--ds-brand-300)",
    tone: "dark",
  },
  attendance: {
    en: "ROLL CALL",
    desc: "출석·지각 기록과 벌점·벌금",
    bg: "var(--ds-brand-900)",
    tone: "light",
  },
  slack: {
    en: "SLACK BACKUP",
    desc: "내 슬랙 메시지를 내 컴퓨터에 백업·열람",
    bg: "var(--ds-brand-500)",
    tone: "dark",
  },
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
      <AuthStage vivid>
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

  const apps = reachableApps(me.role, { slackBackup: me.slackBackup });

  return (
    <AuthStage vivid>
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
                  color: tile.tone === "dark" ? "#fff" : "var(--ds-brand-100)",
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
