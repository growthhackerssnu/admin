import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CompanyCommand,
  SearchInput,
  TemplateBindings,
  Workspace,
} from "../models/outreach";
import type { OutreachRepository } from "../services/outreachRepository";
export function useWorkspace(repository: OutreachRepository) {
  const [data, setData] = useState<Workspace>();
  const [templates, setTemplates] = useState<TemplateBindings>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++generation.current;
    setLoading(true);
    setData(undefined);
    setError("");
    try {
      const [next, bindings] = await Promise.all([
        repository.load(),
        repository.getTemplates(),
      ]);
      if (seq === generation.current) {
        setData(next);
        setTemplates(bindings);
      }
    } catch (e) {
      if (seq === generation.current)
        setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      if (seq === generation.current) setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  async function run(action: () => Promise<Workspace>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setData(await action());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    data,
    templates,
    loading,
    busy,
    error,
    reload,
    clearError: () => setError(""),
    execute: (id: string, version: number, command: CompanyCommand) =>
      run(() => repository.execute(id, version, command)),
    search: (input: SearchInput) =>
      run(() => repository.search(input, data!.cycles.at(-1)!.id)),
    reset: async () => {
      const ok = await run(() => repository.reset());
      if (ok) await reload();
      return ok;
    },
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
