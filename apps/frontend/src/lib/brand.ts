import type { ThemeConfig } from "antd";
// Pretendard(SIL OFL 1.1, 웹 배포 허용)를 우리 번들에 포함한다(self-host). 글자별로 쪼개진
// 파일을 필요한 만큼만 내려받는다. 이 모듈을 쓰는 레이아웃(hr·portal)은 지연 로딩되므로
// 다른 화면(dh·nut·admin)엔 영향이 없다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./brand.css";

// 그로스해커스 어드민의 브랜드 토큰. 학회에서 협의한 네이비 계열 5색을 기준으로 한다
// (2026-10-01): #001136 · #152F69 · #3E5C9C · #7C96CF · #CCDCFF.
// 바탕·구분선·보조 글씨는 팔레트에 없어서 같은 계열로 파생한 블루그레이를 쓴다.
// hr(그핵드인)과 portal(로그인·index)이 같이 쓴다. 공용 tokens(@dhbot/ui-shell)는 건드리지
// 않고, 이 테마를 입힌 레이아웃(HrLayout·PortalLayout) 안에서만 덮어쓴다.
// CSS 쪽 변수(brand.css)와 값이 같아야 한다.
export const BRAND_COLORS = {
  // 협의된 팔레트
  navy900: "#001136", // 글자·제목·어두운 배경
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

export const BRAND_FONT_FAMILY =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif';

export const brandTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND_COLORS.blue500,
    colorLink: BRAND_COLORS.blue500,
    colorInfo: BRAND_COLORS.blue500,
    colorSuccess: BRAND_COLORS.success,
    colorError: BRAND_COLORS.error,
    colorText: BRAND_COLORS.navy900,
    colorTextSecondary: BRAND_COLORS.muted,
    colorBorder: BRAND_COLORS.lineStrong,
    colorBorderSecondary: BRAND_COLORS.line,
    colorBgLayout: BRAND_COLORS.canvas,
    borderRadius: 10,
    borderRadiusLG: 14,
    fontFamily: BRAND_FONT_FAMILY,
    fontSize: 14,
    fontWeightStrong: 700,
    controlHeight: 36,
  },
  components: {
    Button: {
      // 주요 버튼은 깊은 네이비, 그림자는 없애 평평하게.
      colorPrimary: BRAND_COLORS.navy700,
      algorithm: true,
      primaryShadow: "none",
      defaultShadow: "none",
      fontWeight: 600,
    },
    Card: { borderRadiusLG: 14 },
    Table: {
      headerBg: "#E8EEFB",
      headerColor: BRAND_COLORS.navy900,
      borderColor: BRAND_COLORS.line,
      rowHoverBg: "#F2F6FE",
    },
    Descriptions: { labelBg: "#EEF2FB" },
    Segmented: {
      itemSelectedBg: BRAND_COLORS.navy900,
      itemSelectedColor: "#ffffff",
      trackBg: "#E6ECF8",
    },
    Collapse: { headerPadding: "10px 4px", contentPadding: "4px 4px 12px" },
    Tag: { defaultBg: "#E8EEFB", defaultColor: BRAND_COLORS.navy700 },
  },
};
