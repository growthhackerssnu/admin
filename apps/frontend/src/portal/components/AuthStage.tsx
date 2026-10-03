import type { ReactNode } from "react";

export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="auth-stage">
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
