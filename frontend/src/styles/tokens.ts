import type { ThemeConfig } from "antd";
// Temporary visual baseline. Shared by CSS variables and Ant Design.
export const tokens = {
  color: {
    primary: "#1677ff",
    canvas: "#f5f5f5",
    surface: "#ffffff",
    text: "#262626",
    muted: "#667085",
    border: "#e5e7eb",
  },
  font: {
    family:
      "-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif",
    body: 14,
    title: 26,
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: 6,
  width: 1400,
};
export const theme: ThemeConfig = {
  token: {
    colorPrimary: tokens.color.primary,
    colorText: tokens.color.text,
    colorTextSecondary: tokens.color.muted,
    borderRadius: tokens.radius,
    fontFamily: tokens.font.family,
    fontSize: tokens.font.body,
  },
};
export function installTokens() {
  const s = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens.color))
    s.setProperty(`--color-${key}`, value);
  for (const [key, value] of Object.entries(tokens.space))
    s.setProperty(`--space-${key}`, `${value}px`);
  s.setProperty("--font-family", tokens.font.family);
  s.setProperty("--font-body", `${tokens.font.body}px`);
  s.setProperty("--font-title", `${tokens.font.title}px`);
  s.setProperty("--radius", `${tokens.radius}px`);
  s.setProperty("--content-width", `${tokens.width}px`);
}
