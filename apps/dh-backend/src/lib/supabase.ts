import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 모듈 로드 시점에 즉시 생성하면 env가 아직 없을 때(빌드 시점, 콜드 스타트 직후
// 설정 누락 등) "supabaseUrl is required"로 그냥 죽는다. 실제로 쓰일 때(요청 처리
// 중) 지연 생성해서, 값이 없을 때도 최소한 명확한 UNAUTHENTICATED로 이어지게 한다.
let cached: SupabaseClient | null = null;

export function getSupabaseAuthClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.");
  }

  cached = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
