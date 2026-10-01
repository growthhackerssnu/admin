import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import { brandTheme } from "../lib/brand";
import "./portal.css";

// portal 로그인·index 화면 전용 겉옷(main.tsx의 레이아웃 라우트). hr과 같은 브랜드 테마를
// 입힌다(lib/brand.ts). 밝은 앱 화면인 /admin(회원 관리)은 이 레이아웃이 아니라 hr 레이아웃을 쓴다.
//  - ConfigProvider: Ant Design 컴포넌트의 색·폰트·모서리를 브랜드 테마로
//  - AntApp: message 알림도 같은 테마를 따르도록 이 안에 별도로 둔다
//  - body 클래스: 팝업과, 어두운 배경 화면의 끝(스크롤 바운스 영역)까지 같은 색으로
export default function PortalLayout() {
  useLayoutEffect(() => {
    document.body.classList.add("portal-theme-active");
    return () => document.body.classList.remove("portal-theme-active");
  }, []);

  return (
    <ConfigProvider theme={brandTheme}>
      <AntApp>
        <div className="portal-theme">
          <Outlet />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
