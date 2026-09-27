import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { installTokens, theme } from "@dhbot/ui-shell";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
installTokens();

// gateway 경유 시 basename(/hr) 필요 여부는 아직 미검증이다 — dh-frontend와
// 같은 이슈(ISSUE_dh-frontend-routing.md), 첫 실제 배포 때 확인한다
// (ARCHITECTURE.md §3.1, §10).
function Root() {
  return (
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
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
