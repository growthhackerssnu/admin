import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HistoryWorkspace, createHistoryMemory } from "./HistoryWorkspace";
import { unavailableHistoryRepository } from "./historyRepository";

describe("history screens before live API connection", () => {
  it("shows connection pending rather than fixture companies or write actions", () => {
    const load = vi.fn(unavailableHistoryRepository.load);
    const execute = vi.fn(unavailableHistoryRepository.execute);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HistoryWorkspace
          kind="collaboration-history"
          repository={{ mode: "unavailable", load, execute }}
          memory={createHistoryMemory()}
          selectedId={null}
          onSelect={() => {}}
          onTabChange={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("이력 API 연결 준비 중");
    expect(html).toContain("신규 발굴로 이동");
    expect(html).not.toContain("모닝루프");
    expect(html).not.toContain("협업 추가");
    expect(load).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
