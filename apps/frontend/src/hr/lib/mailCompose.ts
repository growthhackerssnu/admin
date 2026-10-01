// "메일 보내기" 링크. 환경마다 가장 안전한 방식을 쓴다:
//  - 데스크톱: Gmail 웹 컴포즈(새 탭)
//  - Android:  Gmail 앱으로 먼저 열고, 앱이 없으면 같은 웹 컴포즈로 넘어간다
//  - iPhone/iPad: `mailto:` — iOS가 사용자가 "기본 메일 앱"으로 정해 둔 앱(Gmail로 바꿔
//    둔 사람은 Gmail)으로 새 메일 작성 화면을 연다
//
// 왜 Android는 intent, iPhone은 mailto인가:
//  - Android Chrome은 `intent:` 주소에 "앱이 없으면 갈 주소"(S.browser_fallback_url)를 함께
//    줄 수 있어서 앱 설치 여부를 몰라도 안전하다.
//  - iPhone에는 그런 안전한 방법이 없다. Gmail 앱 전용 주소(googlegmail://)는 앱이 없으면
//    Safari가 오류 창을 띄우고, 있어도 "열까요?" 확인창이 떠서 "안 열렸으면 웹으로"
//    같은 타이머 fallback과 충돌한다. 그래서 iOS가 알아서 고르는 mailto를 쓴다.
//    (한계: 기본 메일 앱이 Apple 메일인 사람은 그 앱으로 열리고, 메일 계정이 없는 사람은
//    웹으로 넘어가는 fallback이 없다.)
//
// ⚠️ Android intent·iOS mailto는 실제 기기에서 확인해야 한다(개발 PC에선 재현 불가).
// 문제가 있으면 openMailAppIfPossible 호출만 지우면 웹 링크로 돌아간다.

export function gmailWebUrl(email: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
}

export function mailtoUrl(email: string): string {
  return `mailto:${encodeURIComponent(email)}`;
}

// Chrome(Android)의 intent 주소. 구조: intent:<받는 사람>#Intent;scheme=mailto;...;end
// 앱(com.google.android.gm)이 있으면 새 메일 작성 화면으로, 없으면 fallback 주소로 간다.
export function gmailAndroidIntentUrl(email: string): string {
  const fallback = encodeURIComponent(gmailWebUrl(email));
  return (
    `intent:${encodeURIComponent(email)}#Intent;scheme=mailto;` +
    `action=android.intent.action.SENDTO;package=com.google.android.gm;` +
    `S.browser_fallback_url=${fallback};end`
  );
}

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

// iPhone·iPod·iPad. iPadOS 13+ 의 Safari는 "데스크톱용" UA(Macintosh)를 보내서 UA만으로는
// iPad를 못 알아본다 — 터치 지점이 여러 개인 Mac 플랫폼이면 iPad로 본다.
export function isIOS(userAgent: string, platform = "", maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return platform === "MacIntel" && maxTouchPoints > 1;
}

// 링크 클릭 핸들러에서 쓴다. Android(Gmail 앱)나 iOS(기본 메일 앱)로 직접 이동시켰으면
// true를 돌려준다(그 경우 호출부가 원래 링크 이동을 막아야 한다). 그 밖엔 false —
// 원래 Gmail 웹 링크가 그대로 동작한다.
export function openMailAppIfPossible(email: string): boolean {
  if (isAndroid(navigator.userAgent)) {
    window.location.href = gmailAndroidIntentUrl(email);
    return true;
  }
  if (isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
    window.location.href = mailtoUrl(email);
    return true;
  }
  return false;
}
