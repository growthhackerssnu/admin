import { useLayoutEffect } from "react";
import { Outlet } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
// Pretendard(SIL OFL 1.1, 웹 배포 허용)를 우리 번들에 포함한다(self-host). 글자별로
// 쪼개진 파일을 필요한 만큼만 내려받는다. hr 레이아웃과 함께 지연 로딩되므로
// 다른 화면(portal·dh·nut)엔 영향이 없다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { hrTheme } from "./theme";
import "./theme.css";

// hr 화면 전용 겉옷. /hr 아래 모든 화면이 이 안에서 렌더링된다(main.tsx의 레이아웃 라우트).
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
    <ConfigProvider theme={hrTheme}>
      <AntApp>
        <div className="hr-theme">
          <Outlet />
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
