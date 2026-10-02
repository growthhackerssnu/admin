import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ReviewWorkspace from "./ReviewWorkspace";

// Local development entry for the real React review screen; no auth guard or live API.
createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><ReviewWorkspace /></BrowserRouter></StrictMode>,
);
