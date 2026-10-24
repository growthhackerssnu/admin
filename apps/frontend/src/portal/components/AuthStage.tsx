import type { ReactNode } from "react";

// vivid: 앱 선택 화면(index)의 짙은 남색 무대 — 2026-10-02 브랜드 테마의 배경을 되살린 것.
// 로그인은 공통 디자인 시스템의 밝은 표면 그대로 둔다.
export function AuthStage({
  children,
  vivid = false,
}: {
  children: ReactNode;
  vivid?: boolean;
}) {
  return (
    <div className={vivid ? "auth-stage auth-stage-vivid" : "auth-stage"}>
      <div className="auth-backdrop" aria-hidden="true" />
      <div className="auth-stage-content">{children}</div>
    </div>
  );
}

export function AuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-label="불러오는 중">
      <span />
      <span />
      <span />
    </div>
  );
}
