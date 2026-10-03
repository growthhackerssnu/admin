import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useKeepWarm } from "../../../lib/useKeepWarm";
import ReviewWorkspace from "./ReviewWorkspace";
import { LiveReviewRepository } from "./liveRepository";
import { OperationsPage } from "./OperationsPage";

export default function LiveReviewWorkspace() {
  const [params] = useSearchParams();
  const repository = useMemo(() => {
    try { return new LiveReviewRepository(); }
    catch (error) { return error instanceof Error ? error : new Error("연결 설정을 확인해주세요."); }
  }, []);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthenticated(Boolean(session));
    });
    void supabase.auth.getSession().then(({ data: result }) => {
      if (active) setAuthenticated(Boolean(result.session));
    }).catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useKeepWarm(authenticated === true);
  if (params.get("reviewPreview") === "1") return <ReviewWorkspace />;
  if (repository instanceof Error) return <main role="alert">{repository.message}</main>;
  if (authenticated === null) return <main role="status">로그인 확인 중…</main>;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (params.get("view") === "operations") return <OperationsPage repository={repository} />;
  return <ReviewWorkspace repository={repository} historyMode="mock" />;
}
