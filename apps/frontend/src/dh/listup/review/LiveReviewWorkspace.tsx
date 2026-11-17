import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { useKeepWarm } from "../../../lib/useKeepWarm";
import ReviewWorkspace from "./ReviewWorkspace";
import { LiveReviewRepository } from "./liveRepository";
import { SettingsPage } from "./SettingsPage";
import { createPreviewSettingsRepository } from "./previewSettings";
import { AutoExcludedPage } from "./AutoExcludedPage";
import { LiveHistoryRepository } from "./liveHistoryRepository";

export default function LiveReviewWorkspace() {
  const [params] = useSearchParams();
  const repository = useMemo(() => {
    try { return new LiveReviewRepository(); }
    catch (error) { return error instanceof Error ? error : new Error("연결 설정을 확인해주세요."); }
  }, []);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const historyRepository = useMemo(() => {
    try { return new LiveHistoryRepository(); }
    catch (error) { return error instanceof Error ? error : new Error("연결 설정을 확인해주세요."); }
  }, []);
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
  // 설정의 새 주소는 view=settings이고, 예전 주소 view=operations도 같은 페이지를 연다.
  const settingsView = ["settings", "operations"].includes(params.get("view") ?? "");
  const previewSettings = useMemo(() => createPreviewSettingsRepository(), []);
  if (params.get("reviewPreview") === "1")
    return settingsView ? <SettingsPage repository={previewSettings} /> : <ReviewWorkspace />;
  if (repository instanceof Error) return <main role="alert">{repository.message}</main>;
  if (historyRepository instanceof Error) return <main role="alert">{historyRepository.message}</main>;
  if (authenticated === null) return <main role="status">로그인 확인 중…</main>;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (settingsView) return <SettingsPage repository={repository} />;
  if (params.get("view") === "auto-excluded") return <AutoExcludedPage repository={repository} />;
  return <ReviewWorkspace repository={repository} liveHistoryRepository={historyRepository} />;
}
