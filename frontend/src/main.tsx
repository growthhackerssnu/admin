import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import App from "./App";
import { createMockRepository } from "./mocks/mockRepository";
import type { Scenario } from "./models/outreach";
import { installTokens, theme } from "./styles/tokens";
import "antd/dist/reset.css";
import "./styles/app.css";
installTokens();
function Root() {
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
  return (
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <App
          repository={repository}
          scenario={scenario}
          onScenario={setScenario}
        />
      </AntApp>
    </ConfigProvider>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
