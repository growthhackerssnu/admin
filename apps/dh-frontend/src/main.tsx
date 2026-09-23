import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { createMockRepository } from "./mocks/mockRepository";
import type { Scenario } from "./models/outreach";
import { installTokens, theme } from "@dhbot/ui-shell";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
installTokens();
function MockWorkspace() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const repository = useMemo(
    () =>
      createMockRepository(
        {
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
        },
        scenario,
      ),
    [scenario],
  );
  return <App repository={repository} scenario={scenario} onScenario={setScenario} />;
}
function Root() {
  return (
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* 기존 샘플 저장소 기반 목업 — 실 백엔드 연결(liveRepository)은 별도 작업.
                로그인/회원 관리는 apps/portal-frontend가 admin.ghsnu.com 루트에서 담당한다. */}
            <Route path="/" element={<MockWorkspace />} />
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
