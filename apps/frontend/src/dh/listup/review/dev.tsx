import "antd/dist/reset.css";
import "@dhbot/ui-shell/src/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import ReviewWorkspace from "./ReviewWorkspace";
import { SettingsPage } from "./SettingsPage";
import { createPreviewSettingsRepository } from "./previewSettings";

// settingsRole=member로 권한 없는 화면을 확인할 수 있다.
const settingsRepositories = {
  lead: createPreviewSettingsRepository(true),
  member: createPreviewSettingsRepository(false),
};
function DevRoot() {
  const [params] = useSearchParams();
  if (["settings", "operations"].includes(params.get("view") ?? ""))
    return (
      <SettingsPage
        repository={
          settingsRepositories[
            params.get("settingsRole") === "member" ? "member" : "lead"
          ]
        }
      />
    );
  return <ReviewWorkspace />;
}

// Local development entry for the real React review screen; no auth guard or live API.
createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><DevRoot /></BrowserRouter></StrictMode>,
);
