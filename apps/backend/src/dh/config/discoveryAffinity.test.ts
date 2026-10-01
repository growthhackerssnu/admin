import { describe, expect, it } from "vitest";
import {
  DISCOVERY_AFFINITY_VERSION,
  getDiscoveryAffinitySnapshot,
} from "./discoveryAffinity";

describe("discovery affinity snapshot", () => {
  it("keeps the past-project discovery profile versioned and bounded", () => {
    const snapshot = getDiscoveryAffinitySnapshot();

    expect(snapshot.version).toBe(DISCOVERY_AFFINITY_VERSION);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.queryLenses).toHaveLength(3);
    expect(snapshot.queryLenses.every((lenses) => lenses.length === 3)).toBe(
      true,
    );
    expect(snapshot.rankingTerms).toContain("리텐션");
    expect(snapshot.rankingTerms).toContain("추천");
  });
});
