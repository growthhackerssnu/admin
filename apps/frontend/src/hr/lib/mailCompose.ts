// "메일 보내기" 링크. 기본은 Gmail 웹 컴포즈(데스크톱, iPhone)이고, Android에서는
// Gmail 앱으로 먼저 열고 앱이 없으면 같은 웹 컴포즈로 넘어간다.
//
// 왜 Android만 앱 우선인가: Android Chrome은 `intent:` 주소에 "앱이 없으면 갈 주소"
// (S.browser_fallback_url)를 함께 줄 수 있어서, 앱 설치 여부를 몰라도 안전하다.
// iPhone은 그런 안전한 방법이 없다 — Gmail 앱 전용 주소(googlegmail://)를 열면 앱이
// 없을 때 Safari가 오류 창을 띄우고, 앱이 있어도 "열까요?" 확인창이 떠서 타이머로 웹에
// 넘기는 방식이 서로 충돌한다. 그래서 iPhone은 웹 컴포즈(Gmail 앱이 설치돼 있으면
// 웹 화면에서 "앱에서 열기"가 나온다)를 그대로 쓴다.
//
// ⚠️ Android intent 방식은 실제 기기에서 확인해야 한다(개발 PC에선 재현 불가).
// 문제가 있으면 openGmailAppIfPossible만 지우면 웹 링크로 돌아간다.

export function gmailWebUrl(email: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
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

// 링크 클릭 핸들러에서 쓴다. Android에서 Gmail 앱 주소로 직접 이동시켰으면 true를
// 돌려준다(그 경우 호출부가 원래 링크 이동을 막아야 한다). 그 밖엔 false — 원래
// 웹 링크가 그대로 동작한다.
export function openGmailAppIfPossible(email: string): boolean {
  if (!isAndroid(navigator.userAgent)) return false;
  window.location.href = gmailAndroidIntentUrl(email);
  return true;
}
