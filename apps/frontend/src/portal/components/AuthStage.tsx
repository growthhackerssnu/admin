import type { ReactNode } from "react";

// 로그인·index가 같이 쓰는 어두운 네이비 배경 무대. 지금은 영상 없이 그라데이션과 은은한
// 격자만 쓴다(2026-10-02 결정). 나중에 학회 소개 영상을 쓰게 되면 .auth-backdrop 안에
// <video>(muted·loop·playsInline, 모바일·모션 줄이기 설정에선 숨김)를 넣으면 된다.
export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="auth-stage">
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-stage-content">{children}</div>
    </div>
  );
}

// 세션·계정 정보를 확인하는 짧은 순간에 보이는 로딩 표시. 예전엔 흰 카드 안에 스켈레톤을
// 그려서, 어두운 배경 위에 흰 세로 박스가 번쩍 보였다 — 지금은 배경 위에 점 세 개만 둔다.
export function AuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-label="불러오는 중">
      <span />
      <span />
      <span />
    </div>
  );
}
