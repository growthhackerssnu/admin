import { useCallback, useLayoutEffect, useState } from "react";

// Share reserved scrollbar space with the header/footer, including nested editors.
export function useAlignedScroll<T extends HTMLElement = HTMLDivElement>(ancestorSelector?: string) {
  const [body, setBody] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setBody(node), []);
  useLayoutEffect(() => {
    const pane = (ancestorSelector ? body?.closest<HTMLElement>(ancestorSelector) : undefined) ?? body?.parentElement;
    if (!body || !pane) return;
    const measure = () => pane.style.setProperty("--layout-scrollbar-size", `${body.offsetWidth - body.clientWidth}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    measure();
    return () => { observer.disconnect(); pane.style.removeProperty("--layout-scrollbar-size"); };
  }, [body, ancestorSelector]);
  return ref;
}
