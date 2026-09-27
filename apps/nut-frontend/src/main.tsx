import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { installTokens, theme } from "@dhbot/ui-shell";
import App from "./App";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
import "./nut.css";

installTokens();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
