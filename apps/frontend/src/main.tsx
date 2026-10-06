import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider, Skeleton } from "antd";
import koKR from "antd/locale/ko_KR";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { adminTheme } from "./design-system/antd-theme";
import { LoadingScreen } from "./lib/LoadingScreen";
import { RequireApp } from "./portal/components/RequireApp";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
import "./design-system/globals.css";
import "./lib/brand.css";
import "./design-system/workspace.css";
import "./design-system/layout.css";

// /admin(회원 관리)은 hr 승인 큐와 같은 밝은 앱 화면이라 hr 레이아웃(브랜드 테마) 안에서 보인다.
const AdminMembers = lazy(() =>
  import("./portal/pages/AdminMembers").then((m) => ({
    default: m.AdminMembers,
  })),
);
const AdminGhbotTokens = lazy(() =>
  import("./portal/pages/AdminGhbotTokens").then((m) => ({
    default: m.AdminGhbotTokens,
  })),
);
// 로그인·index는 공통 디자인 시스템와 함께 지연 로딩되는 portal 레이아웃 안에서 보인다.
// /admin(회원 관리)은 아래 hr 레이아웃(밝은 앱 화면) 쪽이다.
const PortalLayout = lazy(() => import("./portal/PortalLayout"));
const Login = lazy(() =>
  import("./portal/pages/Login").then((m) => ({ default: m.Login })),
);
const Index = lazy(() =>
  import("./portal/pages/Index").then((m) => ({ default: m.Index })),
);

// 화면별 코드는 처음 들어갈 때만 불러온다. 한 번 불러오면 이후 이동은 새로고침 없다.
const DhReviewWorkspace = lazy(
  () => import("./dh/listup/review/LiveReviewWorkspace"),
);
// hr 화면 전용 겉옷(테마·폰트). hr 라우트 전체를 이 레이아웃 라우트로 감싼다.
const HrLayout = lazy(() => import("./hr/HrLayout"));
const HrDirectory = lazy(() =>
  import("./hr/pages/Directory").then((m) => ({ default: m.Directory })),
);
const HrProfileDetail = lazy(() =>
  import("./hr/pages/ProfileDetail").then((m) => ({
    default: m.ProfileDetail,
  })),
);
const HrMyRequests = lazy(() =>
  import("./hr/pages/MyRequests").then((m) => ({ default: m.MyRequests })),
);
const HrAdminQueue = lazy(() =>
  import("./hr/pages/AdminQueue").then((m) => ({ default: m.AdminQueue })),
);
const Nut = lazy(() => import("./nut"));
const Attendance = lazy(() => import("./attendance"));

// 화면 코드를 불러오는 짧은 동안 보이는 자리표시. 로그인·index는 공통 배경 화면이라 같은 색
// 바탕만 깔아서(CSS 파일이 아직 안 왔으므로 인라인) 흰/회색 스켈레톤이 번쩍이지 않게 한다.
const AUTH_PATHS = ["/", "/login", "/index"];
// 밝은 앱 화면(hr·회원 관리·dh·nut)의 주소 — 이 화면들은 파란 점 로딩 화면을 쓴다.
function isAppScreenPath(pathname: string) {
  return (
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/admin" ||
    pathname === "/dh" ||
    pathname === "/nut" ||
    pathname.startsWith("/nut/") ||
    pathname === "/attendance"
  );
}
function RouteFallback() {
  const { pathname } = useLocation();
  if (AUTH_PATHS.includes(pathname)) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--ds-surface-canvas)",
        }}
      />
    );
  }
  // hr·회원 관리는 데이터 로딩 단계와 같은 로딩 화면(파란 점)을 이어서 보여준다.
  if (isAppScreenPath(pathname)) return <LoadingScreen />;
  return <Skeleton active style={{ padding: 24 }} />;
}

function LegacyDhRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: "/dh", search: location.search, hash: location.hash }}
      replace
    />
  );
}

function Root() {
  return (
    <ConfigProvider locale={koKR} theme={adminTheme}>
      <AntApp>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* portal: "/"는 Google OAuth redirectTo(origin) 착지점이기도 하다 */}
              <Route element={<PortalLayout />}>
                <Route path="/" element={<Login />} />
                <Route path="/login" element={<Login />} />
                <Route path="/index" element={<Index />} />
              </Route>

              {/* dh·nut·출석체크는 role이 맞지 않으면(예: alumni) 화면 대신 안내를 보여준다.
                  /admin은 AdminMembers가 자체 가드를 갖고 있다. */}

              <Route element={<HrLayout />}>
                <Route path="/hr" element={<HrDirectory />} />
                <Route
                  path="/hr/people/:notionPageId"
                  element={<HrProfileDetail />}
                />
                <Route path="/hr/requests" element={<HrMyRequests />} />
                <Route path="/hr/admin" element={<HrAdminQueue />} />
                <Route path="/admin" element={<AdminMembers />} />
                <Route path="/admin/ghbot" element={<AdminGhbotTokens />} />
                {/* 대협·NUT도 그핵드인·관리자와 같은 밝은 앱 화면(테마·폰트)으로 보인다. */}
                <Route
                  path="/dh"
                  element={
                    <RequireApp app="dh">
                      <DhReviewWorkspace />
                    </RequireApp>
                  }
                />
                <Route
                  path="/dh/listup"
                  element={
                    <RequireApp app="dh">
                      <LegacyDhRedirect />
                    </RequireApp>
                  }
                />
                <Route
                  path="/nut/*"
                  element={
                    <RequireApp app="nut">
                      <Nut />
                    </RequireApp>
                  }
                />
                <Route
                  path="/attendance"
                  element={
                    <RequireApp app="attendance">
                      <Attendance />
                    </RequireApp>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
