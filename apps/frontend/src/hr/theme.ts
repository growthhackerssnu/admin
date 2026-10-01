import type { ThemeConfig } from "antd";

// hr(그핵드인) 전용 디자인 토큰. 학회에서 협의한 네이비 계열 5색을 기준으로 한다
// (2026-10-01): #001136 · #152F69 · #3E5C9C · #7C96CF · #CCDCFF.
// 바탕·구분선·보조 글씨는 팔레트에 없어서 같은 계열로 파생한 블루그레이를 쓴다.
// 공용 tokens(@dhbot/ui-shell)는 건드리지 않고 hr 화면 안에서만 덮어쓴다(HrLayout.tsx).
// CSS 쪽 변수(theme.css)와 값이 같아야 한다.
export const HR_COLORS = {
  // 협의된 팔레트
  navy900: "#001136", // 글자·제목·side pane 배경
  navy700: "#152F69", // 주요 버튼·보조 제목
  blue500: "#3E5C9C", // 메인(링크·체크박스·포커스·hover)
  blue300: "#7C96CF", // 포인트(점·밑줄·막대·테두리)
  blue100: "#CCDCFF", // 칩 배경
  // 파생 중립색(블루그레이)
  muted: "#5B6A8C",
  line: "#E1E7F3",
  lineStrong: "#D0D9EC",
  canvas: "#F4F6FB",
  // 의미 색(상태 표시용이라 브랜드색과 별개로 유지)
  success: "#2C8C73",
  error: "#D4534E",
};

export const HR_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif';

export const hrTheme: ThemeConfig = {
  token: {
    colorPrimary: HR_COLORS.blue500,
    colorLink: HR_COLORS.blue500,
    colorInfo: HR_COLORS.blue500,
    colorSuccess: HR_COLORS.success,
    colorError: HR_COLORS.error,
    colorText: HR_COLORS.navy900,
    colorTextSecondary: HR_COLORS.muted,
    colorBorder: HR_COLORS.lineStrong,
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
      // 주요 버튼은 깊은 네이비, 그림자는 없애 평평하게.
      colorPrimary: HR_COLORS.navy700,
      algorithm: true,
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 600,
    },
    Card: { borderRadiusLG: 14 },
    Table: {
      headerBg: "#E8EEFB",
      headerColor: HR_COLORS.navy900,
      borderColor: HR_COLORS.line,
      rowHoverBg: "#F2F6FE",
    },
    Descriptions: { labelBg: "#EEF2FB" },
    Segmented: { itemSelectedBg: HR_COLORS.navy900, itemSelectedColor: "#ffffff", trackBg: "#E6ECF8" },
    Collapse: { headerPadding: "10px 4px", contentPadding: "4px 4px 12px" },
    Tag: { defaultBg: "#E8EEFB", defaultColor: HR_COLORS.navy700 },
  },
};
