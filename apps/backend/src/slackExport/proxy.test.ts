import { describe, expect, it } from "vitest";
import { isAllowedFileUrl, isAllowedRedirect } from "./proxy";

describe("isAllowedFileUrl", () => {
  it("allows Slack file and image hosts over https", () => {
    expect(isAllowedFileUrl("https://files.slack.com/files-pri/T1-F1/a.png")).toBe(true);
    expect(isAllowedFileUrl("https://avatars.slack-edge.com/2024/a_192.png")).toBe(true);
    expect(isAllowedFileUrl("https://emoji.slack-edge.com/T1/party/abc.gif")).toBe(true);
    expect(isAllowedFileUrl("https://secure.gravatar.com/avatar/x.jpg")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isAllowedFileUrl("http://files.slack.com/a.png")).toBe(false);
    expect(isAllowedFileUrl("https://files.slack.com.evil.com/a.png")).toBe(false);
    expect(isAllowedFileUrl("https://evil.com/?files.slack.com")).toBe(false);
    expect(isAllowedFileUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedFileUrl("not a url")).toBe(false);
  });
});

describe("isAllowedRedirect", () => {
  const origins = ["http://localhost:5173", "https://admin.ghsnu.com"];
  it("allows /slack/callback on allowed origins only", () => {
    expect(isAllowedRedirect("https://admin.ghsnu.com/slack/callback", origins)).toBe(true);
    expect(isAllowedRedirect("http://localhost:5173/slack/callback", origins)).toBe(true);
    expect(isAllowedRedirect("https://admin.ghsnu.com/other", origins)).toBe(false);
    expect(isAllowedRedirect("https://evil.com/slack/callback", origins)).toBe(false);
  });
});
