import { describe, expect, it, vi } from "vitest";
import { AcquisitionQuarterApi } from "./acquisitionQuarter";
import {
  HumanReviewApiError,
  type HumanReviewTransport,
} from "./humanReviewApi";

const quarter = { id: "q-1", year: 2027, quarter: 1 };
const round = {
  id: "round-1",
  targetQuarter: quarter,
  startedAt: "2026-10-03",
  endedAt: null,
};
function setup() {
  const request = vi.fn();
  return {
    request,
    api: new AcquisitionQuarterApi({ request } as HumanReviewTransport),
  };
}
describe("team acquisition quarter settings contract", () => {
  it("includes the observed active round and stable request key when applying a quarter", async () => {
    const { request, api } = setup();
    request.mockResolvedValue({
      data: {
        currentRound: round,
        closedRoundId: "old-round",
        unresolvedCount: 3,
      },
    });
    const result = await api.set("q-1", "old-round", "apply-key");
    expect(request).toHaveBeenCalledWith(
      "/acquisition-rounds",
      "POST",
      { targetQuarterId: "q-1", expectedActiveRoundId: "old-round" },
      "apply-key",
    );
    expect(result.unresolvedCount).toBe(3);
  });
  it("passes null for the first setting and never treats quarter registration as round activation", async () => {
    const { request, api } = setup();
    request.mockResolvedValue({ data: quarter });
    await api.register(2027, 1, "register-key");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "/target-quarters",
      "POST",
      { year: 2027, quarter: 1 },
      "register-key",
    );
    await api.set("q-1", null, "first-key");
    expect(request).toHaveBeenLastCalledWith(
      "/acquisition-rounds",
      "POST",
      { targetQuarterId: "q-1", expectedActiveRoundId: null },
      "first-key",
    );
  });
  it("recovers an already registered quarter by reading its ID without creating again", async () => {
    const { request, api } = setup();
    request
      .mockRejectedValueOnce(
        new HumanReviewApiError("이미 있음", 409, "ALREADY_EXISTS"),
      )
      .mockResolvedValueOnce({ data: [quarter] });
    expect(await api.register(2027, 1, "register-key")).toEqual(quarter);
    expect(
      request.mock.calls.filter(([, method]) => method === "POST"),
    ).toHaveLength(1);
  });
  it("loads all quarter pages and rejects a repeating cursor", async () => {
    const { request, api } = setup();
    request
      .mockResolvedValueOnce({
        data: [quarter],
        page: { hasMore: true, nextCursor: "next" },
      })
      .mockResolvedValueOnce({
        data: [{ ...quarter, id: "q-2" }],
        page: { hasMore: false, nextCursor: null },
      });
    expect(await api.quarters()).toHaveLength(2);
    expect(request).toHaveBeenLastCalledWith(
      "/target-quarters?limit=100&cursor=next",
    );
    request.mockResolvedValue({
      data: [],
      page: { hasMore: true, nextCursor: "loop" },
    });
    await expect(api.quarters()).rejects.toThrow("목록을 불러오지 못했습니다");
  });
  it("exposes a round-change conflict instead of automatically applying again", async () => {
    const { request, api } = setup();
    request.mockRejectedValue(
      new HumanReviewApiError("변경됨", 409, "ROUND_CHANGED"),
    );
    await expect(
      api.set("q-1", "old-round", "apply-key"),
    ).rejects.toMatchObject({ code: "ROUND_CHANGED" });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
