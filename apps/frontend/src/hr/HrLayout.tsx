import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import { brandTheme } from "../lib/brand";
import "./theme.css";

// 밝은 앱 화면용 겉옷. /hr 아래 모든 화면과 /admin(회원 관리)이 이 안에서 렌더링된다
// (main.tsx의 레이아웃 라우트). 이름은 hr이지만 admin 화면도 같은 모양을 쓴다.
//  - ConfigProvider: Ant Design 컴포넌트의 색·폰트·모서리를 hr 테마로
//  - AntApp: message/modal이 hr 테마를 따르도록 hr 안에 별도로 둔다
//  - body 클래스: 모달·드롭다운처럼 body 밑에 따로 그려지는 팝업과 페이지 배경도
//    같은 색·폰트 변수를 받게 한다(theme.css). hr을 벗어나면 클래스를 지운다.
export default function HrLayout() {
  useLayoutEffect(() => {
    document.body.classList.add("hr-theme-active");
    return () => document.body.classList.remove("hr-theme-active");
  }, []);

  return (
    <ConfigProvider theme={brandTheme}>
      <AntApp>
        <div className="hr-theme">
          <Outlet />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
