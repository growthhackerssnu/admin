import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider, Skeleton } from "antd";
import koKR from "antd/locale/ko_KR";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { installTokens, theme } from "@dhbot/ui-shell";
import { Login } from "./portal/pages/Login";
import { Index } from "./portal/pages/Index";
import { AdminMembers } from "./portal/pages/AdminMembers";
import { RequireApp } from "./portal/components/RequireApp";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";

installTokens();

// 화면별 코드는 처음 들어갈 때만 불러온다. 한 번 불러오면 이후 이동은 새로고침 없다.
const DhWorkspace = lazy(() => import("./dh/Workspace"));
const DhListup = lazy(() => import("./dh/listup/main"));
const HrDirectory = lazy(() =>
  import("./hr/pages/Directory").then((m) => ({ default: m.Directory })),
);
const HrProfileDetail = lazy(() =>
  import("./hr/pages/ProfileDetail").then((m) => ({ default: m.ProfileDetail })),
);
const HrMyRequests = lazy(() =>
  import("./hr/pages/MyRequests").then((m) => ({ default: m.MyRequests })),
);
const HrAdminQueue = lazy(() =>
  import("./hr/pages/AdminQueue").then((m) => ({ default: m.AdminQueue })),
);
const Nut = lazy(() => import("./nut"));

function Root() {
  return (
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Suspense fallback={<Skeleton active style={{ padding: 24 }} />}>
            <Routes>
              {/* portal: "/"는 Google OAuth redirectTo(origin) 착지점이기도 하다 */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/index" element={<Index />} />
              <Route path="/admin" element={<AdminMembers />} />

              {/* dh·nut은 role이 맞지 않으면(예: alumni) 화면 대신 안내를 보여준다.
                  /admin은 AdminMembers가 자체 가드를 갖고 있다. */}
              <Route
                path="/dh"
                element={
                  <RequireApp app="dh">
                    <DhWorkspace />
                  </RequireApp>
                }
              />
              <Route
                path="/dh/listup"
                element={
                  <RequireApp app="dh">
                    <DhListup />
                  </RequireApp>
                }
              />

              <Route path="/hr" element={<HrDirectory />} />
              <Route path="/hr/people/:notionPageId" element={<HrProfileDetail />} />
              <Route path="/hr/requests" element={<HrMyRequests />} />
              <Route path="/hr/admin" element={<HrAdminQueue />} />

              <Route
                path="/nut/*"
                element={
                  <RequireApp app="nut">
                    <Nut />
                  </RequireApp>
                }
              />

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
