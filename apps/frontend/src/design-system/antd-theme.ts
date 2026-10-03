import type { ThemeConfig } from "antd";
import { token } from "./tokens";
const px = (name: Parameters<typeof token>[0]) =>
  Number.parseFloat(token(name));
export const adminTheme: ThemeConfig = {
  token: {
    colorPrimary: token("--ds-action-primary"),
    colorLink: token("--ds-link"),
    colorInfo: token("--ds-info-foreground"),
    colorSuccess: token("--ds-success-foreground"),
    colorWarning: token("--ds-warning-foreground"),
    colorError: token("--ds-danger-foreground"),
    colorText: token("--ds-text-strong"),
    colorTextSecondary: token("--ds-gray-700"),
    colorBorder: token("--ds-gray-300"),
    colorBorderSecondary: token("--ds-gray-200"),
    colorBgLayout: token("--ds-surface-canvas"),
    colorBgContainer: token("--background"),
    fontFamily: token("--ds-font-family"),
    fontSize: px("--ds-type-body-2"),
    fontSizeSM: px("--ds-type-caption"),
    fontSizeLG: px("--ds-type-body-1"),
    fontSizeHeading1: px("--ds-type-headline-4"),
    fontSizeHeading2: px("--ds-type-headline-5"),
    fontSizeHeading3: px("--ds-type-headline-6"),
    fontSizeHeading4: px("--ds-type-subtitle-1"),
    fontSizeHeading5: px("--ds-type-subtitle-2"),
    borderRadius: 8,
    borderRadiusLG: 8,
    controlHeight: 36,
    fontWeightStrong: 600,
  },
  components: {
    Button: { primaryShadow: "none", defaultShadow: "none", fontWeight: 500 },
    Card: {
      bodyPadding: px("--layout-inset"),
      headerFontSize: px("--ds-type-subtitle-1"),
    },
    Table: {
      headerBg: token("--ds-surface-canvas"),
      headerColor: token("--ds-text-strong"),
      rowHoverBg: token("--ds-surface-selected"),
      cellPaddingBlock: px("--layout-control-gap"),
      cellPaddingInline: px("--layout-field-gap"),
    },
    Descriptions: { labelBg: token("--ds-surface-canvas") },
    Segmented: {
      itemSelectedBg: token("--background"),
      itemSelectedColor: token("--ds-text-strong"),
      trackBg: token("--ds-gray-100"),
    },
    Tag: {
      defaultBg: token("--background"),
      defaultColor: token("--ds-text-strong"),
    },
  },
};
