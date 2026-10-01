import { describe, expect, it } from "vitest";
import {
  invalidSourceEntryUrl,
  isSourceAvailable,
  sourceUnavailableReason,
} from "./sources";
import { getDiscoveryAffinitySnapshot } from "@/dh/config/discoveryAffinity";
import { buildGoogleQueries } from "@/dh/inngest/listupDiscovery";

describe("discovery source availability", () => {
  it("keeps the contract-only InnoForest source unavailable", () => {
    expect(isSourceAvailable("혁신의 숲")).toBe(false);
    expect(sourceUnavailableReason("혁신의 숲")).toContain("계약 API");
  });

  it("allows only StartupRecipe article URLs as newsletter seeds", () => {
    expect(
      invalidSourceEntryUrl(
        "뉴스레터",
        "https://startuprecipe.co.kr/archives/invest-newsletter/123",
      ),
    ).toBeNull();
    expect(
      invalidSourceEntryUrl("뉴스레터", "https://example.com/article"),
    ).not.toBeNull();
    expect(
      invalidSourceEntryUrl(
        "Google",
        "https://startuprecipe.co.kr/archives/invest-newsletter/123",
      ),
    ).not.toBeNull();
  });

  it("builds exactly three bounded Google discovery queries", () => {
    const queries = buildGoogleQueries(
      { key: "Google", name: "Google", entryUrls: [], query: "B2C 구독" },
      {
        industries: ["커머스"],
        keywords: ["리텐션"],
        regions: [],
        companyStages: [],
        excludedCompanyIds: [],
        additionalConditions: null,
      },
    );
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => query.includes("B2C 구독"))).toBe(true);
    const firstRoundLenses =
      getDiscoveryAffinitySnapshot().queryLenses[0] ?? [];
    expect(
      firstRoundLenses.every((lens) =>
        queries.some((query) => query.includes(lens)),
      ),
    ).toBe(true);
  });
});
