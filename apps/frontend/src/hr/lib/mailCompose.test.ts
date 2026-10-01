import { describe, expect, it } from "vitest";
import { gmailAndroidIntentUrl, gmailWebUrl, isAndroid, isIOS, mailtoUrl } from "./mailCompose";

describe("gmailWebUrl", () => {
  it("받는 사람을 URL 인코딩해서 컴포즈 주소를 만든다", () => {
    expect(gmailWebUrl("a+b@snu.ac.kr")).toBe("https://mail.google.com/mail/?view=cm&fs=1&to=a%2Bb%40snu.ac.kr");
  });
});

describe("gmailAndroidIntentUrl", () => {
  const url = gmailAndroidIntentUrl("hello@snu.ac.kr");

  it("mailto SENDTO를 Gmail 앱 패키지로 보낸다", () => {
    expect(url.startsWith("intent:hello%40snu.ac.kr#Intent;")).toBe(true);
    expect(url).toContain("scheme=mailto;");
    expect(url).toContain("action=android.intent.action.SENDTO;");
    expect(url).toContain("package=com.google.android.gm;");
    expect(url.endsWith(";end")).toBe(true);
  });

  it("앱이 없을 때 갈 웹 컴포즈 주소를 fallback으로 담는다(인코딩됨)", () => {
    const fallback = encodeURIComponent(gmailWebUrl("hello@snu.ac.kr"));
    expect(url).toContain(`S.browser_fallback_url=${fallback};`);
    // 인코딩이 안 되면 ';' 등이 intent 구문을 깨뜨리므로 날것의 https://가 없어야 한다
    expect(url).not.toContain("S.browser_fallback_url=https://");
  });
});

describe("isAndroid", () => {
  it("UA로 판별한다", () => {
    expect(isAndroid("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile")).toBe(true);
    expect(isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe(false);
    expect(isAndroid("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(false);
  });
});

describe("mailtoUrl", () => {
  it("받는 사람을 인코딩한 mailto 주소를 만든다", () => {
    expect(mailtoUrl("a+b@snu.ac.kr")).toBe("mailto:a%2Bb%40snu.ac.kr");
  });
});

describe("isIOS", () => {
  it("iPhone/iPad UA를 알아본다", () => {
    expect(isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe(true);
    expect(isIOS("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari")).toBe(true);
  });

  it("iPadOS는 Mac UA를 보내므로 터치 지점으로 판별한다", () => {
    const macUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";
    expect(isIOS(macUa, "MacIntel", 5)).toBe(true);
    expect(isIOS(macUa, "MacIntel", 0)).toBe(false); // 진짜 Mac
  });

  it("Android·Windows는 아니다", () => {
    expect(isIOS("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile", "Linux armv8l", 5)).toBe(false);
    expect(isIOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", "Win32", 0)).toBe(false);
  });
});
