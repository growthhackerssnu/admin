import { useMemo, useState } from "react";
import App from "./App";
import { createMockRepository } from "./mocks/mockRepository";
import type { Scenario } from "./models/outreach";

// /dh — 샘플 저장소 기반 목업. 실 백엔드 연결(liveRepository)은 별도 작업.
export default function Workspace() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const repository = useMemo(
    () =>
      createMockRepository(
        {
          getItem: (key) => window.localStorage.getItem(key),
          setItem: (key, value) => window.localStorage.setItem(key, value),
        },
        scenario,
      ),
    [scenario],
  );
  return <App repository={repository} scenario={scenario} onScenario={setScenario} />;
}
