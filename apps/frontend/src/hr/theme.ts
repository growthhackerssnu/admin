import type { ThemeConfig } from "antd";

// hr(그핵드인) 전용 디자인 토큰 — NUT 화면(src/nut/nut.css의 --finance-*)과 같은
// 계열의 색을 쓴다: 짙은 숲색 잉크 + 라임 포인트 + 그린 메인. 공용 tokens
// (@dhbot/ui-shell)은 건드리지 않고 hr 화면 안에서만 덮어쓴다(HrLayout.tsx).
// CSS 쪽 변수(theme.css)와 값이 같아야 한다.
export const HR_COLORS = {
  ink: "#10241d",
  inkSoft: "#2a4439",
  muted: "#72817a",
  line: "#e2e9e3",
  canvas: "#f5f7f3",
  green: "#2c8c73",
  blue: "#5275d3",
  red: "#d4534e",
  lime: "#d8f36a",
};

export const HR_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif';

export const hrTheme: ThemeConfig = {
  token: {
    colorPrimary: HR_COLORS.green,
    colorLink: HR_COLORS.green,
    colorInfo: HR_COLORS.blue,
    colorSuccess: HR_COLORS.green,
    colorError: HR_COLORS.red,
    colorText: HR_COLORS.ink,
    colorTextSecondary: HR_COLORS.muted,
    colorBorder: "#d3ddd6",
    colorBorderSecondary: HR_COLORS.line,
    colorBgLayout: HR_COLORS.canvas,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: HR_FONT_FAMILY,
    fontSize: 14,
    fontWeightStrong: 700,
    controlHeight: 36,
  },
  components: {
    Button: {
      // 주요 버튼은 NUT의 사이드바처럼 짙은 잉크색, 그림자는 없애 평평하게.
      colorPrimary: HR_COLORS.ink,
      algorithm: true,
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 600,
    },
    Card: { borderRadiusLG: 14 },
    Table: {
      headerBg: "#eef3ea",
      headerColor: HR_COLORS.ink,
      borderColor: HR_COLORS.line,
      rowHoverBg: "#f7faf5",
    },
    Descriptions: { labelBg: "#f1f5ee" },
    Segmented: { itemSelectedBg: HR_COLORS.ink, itemSelectedColor: "#ffffff", trackBg: "#e9efe6" },
    Collapse: { headerPadding: "10px 4px", contentPadding: "4px 4px 12px" },
    Tag: { defaultBg: "#eef3ea", defaultColor: HR_COLORS.inkSoft },
  },
};
