import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Login } from "./pages/Login";
import { AdminMembers } from "./pages/AdminMembers";
import { installTokens, theme } from "@dhbot/ui-shell";
import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
installTokens();

function Root() {
  return (
    <ConfigProvider locale={koKR} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* "/"는 Google OAuth의 redirectTo(origin) 착지점이기도 하다 — Login이
                세션 유무에 따라 로그인 폼을 보여주거나 role 기반으로 리다이렉트한다. */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminMembers />} />
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
