import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createListupApi, ListupApiError } from "./api/client";
import { LiveWorkspace } from "./LiveWorkspace";

const settings = {
  api: import.meta.env.VITE_API_BASE_URL,
  auth: import.meta.env.VITE_SUPABASE_URL,
  key:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY,
};
let client: SupabaseClient | undefined;
function authClient() {
  return (client ??= createClient(settings.auth, settings.key));
}
export function LiveRoot() {
  const missing = [
    !settings.api && "DH 백엔드 주소",
    !settings.auth && "Supabase URL",
    !settings.key && "Supabase 공개 키",
  ].filter(Boolean);
  if (missing.length)
    return (
      <main className="lu-live-gate lu-surface">
        <h1>실제 데이터 연결 설정</h1>
        <p>다음 설정이 필요합니다: {missing.join(", ")}</p>
        <p>
          설정이 완료되면 로그인 후 서버의 조사 결과와 컨택 업무를 불러옵니다.
        </p>
        <a href="?preview=1">샘플 화면 보기</a>
      </main>
    );
  try {
    createListupApi({
      baseUrl: settings.api,
      getAccessToken: async () => null,
    });
    return <Authenticated auth={authClient()} />;
  } catch {
    return (
      <main className="lu-live-gate lu-surface">
        <h1>연결 설정을 확인해주세요</h1>
        <p>백엔드 주소 또는 Supabase 설정이 올바르지 않습니다.</p>
      </main>
    );
  }
}
function Authenticated({ auth }: { auth: SupabaseClient }) {
  const [identity, setIdentity] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [api] = useState(() =>
    createListupApi({
      baseUrl: settings.api,
      getAccessToken: async () => {
        const { data, error } = await auth.auth.getSession();
        if (error)
          throw new ListupApiError(
            "UNAUTHENTICATED",
            "로그인 상태를 확인해주세요.",
            401,
          );
        return data.session?.access_token ?? null;
      },
    }),
  );
  useEffect(() => {
    let active = true;
    let eventReceived = false;
    const apply = (
      session: { user: { id: string; email?: string } } | null,
    ) => {
      if (!active) return;
      setIdentity(
        session
          ? { id: session.user.id, email: session.user.email ?? "로그인됨" }
          : null,
      );
      setLoading(false);
    };
    const { data } = auth.auth.onAuthStateChange((_event, session) => {
      eventReceived = true;
      apply(session);
    });
    void auth.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || eventReceived) return;
        if (error) {
          setError("로그인 상태를 읽지 못했습니다.");
          setLoading(false);
        } else apply(data.session);
      })
      .catch(() => {
        if (!active || eventReceived) return;
        setError("로그인 상태를 읽지 못했습니다.");
        setLoading(false);
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [auth]);
  if (loading)
    return (
      <main className="lu-live-gate" role="status">
        로그인 확인 중…
      </main>
    );
  if (!identity)
    return (
      <main className="lu-live-gate lu-surface">
        <h1>대협 어드민 로그인</h1>
        <p>학회 계정으로 로그인해 조사 결과와 컨택 업무를 확인하세요.</p>
        {error && <p role="alert">{error}</p>}
        <button
          className="lu-primary"
          onClick={() => {
            setError("");
            void auth.auth
              .signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: window.location.origin + window.location.pathname,
                },
              })
              .then(({ error }) => {
                if (error)
                  setError(
                    "로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
                  );
              })
              .catch(() => setError("로그인 서버에 연결하지 못했습니다."));
          }}
        >
          Google로 로그인
        </button>
      </main>
    );
  return (
    <LiveWorkspace
      key={identity.id}
      api={api}
      email={identity.email}
      onSignOut={async () => {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) throw error;
      }}
    />
  );
}
