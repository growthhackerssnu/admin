import { useCallback, useLayoutEffect, useState } from "react";

// Reserve the body's scrollbar width in the header and footer as well.
export function useAlignedScroll<T extends HTMLElement = HTMLDivElement>() {
  const [body, setBody] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setBody(node), []);
  useLayoutEffect(() => {
    const pane = body?.parentElement;
    if (!body || !pane) return;
    const measure = () => pane.style.setProperty("--layout-scrollbar-size", `${body.offsetWidth - body.clientWidth}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    measure();
    return () => { observer.disconnect(); pane.style.removeProperty("--layout-scrollbar-size"); };
  }, [body]);
  return ref;
}
