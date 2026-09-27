import { createClient } from "@supabase/supabase-js";

// 로그인 자체는 portal-frontend가 전담한다(ARCHITECTURE.md §3.1). 이 앱은
// 같은 Supabase 프로젝트의 세션을 읽기만 한다 — 운영에서는 admin.ghsnu.com
// 이라는 같은 origin 아래서 동작하므로, portal이 만든 로그인 세션을
// supabase-js가 브라우저 저장소에서 그대로 읽어올 수 있다.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function signOut() {
  await supabase.auth.signOut();
}
