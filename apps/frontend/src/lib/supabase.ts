import { createClient } from "@supabase/supabase-js";

// 앱 전체가 쓰는 Supabase 클라이언트 하나. 세션은 이 origin의 localStorage에
// 저장되므로 /, /dh, /hr, /nut 어디서나 같은 로그인 상태다.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
