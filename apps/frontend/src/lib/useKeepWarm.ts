import { useEffect } from "react";

const PING_INTERVAL_MS = 4 * 60 * 1000;

// 로그인해있는 동안만 백엔드 헬스체크를 주기적으로 두드려 DB 커넥션이 유휴
// 상태로 끊기지 않게 한다. 아무도 안 쓸 땐 그냥 식게 둬서(= Railway/Cloud Run
// 비용 절감) 세션당 첫 요청 한 번만 콜드 스타트를 감수하는 트레이드오프다.
export function useKeepWarm(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const base = import.meta.env.VITE_API_BASE_URL?.trim();
    if (!base) return;
    let origin: string;
    try {
      origin = new URL(base).origin;
    } catch {
      return;
    }
    const ping = () => {
      void fetch(`${origin}/api/health`).catch(() => {});
    };
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
}
