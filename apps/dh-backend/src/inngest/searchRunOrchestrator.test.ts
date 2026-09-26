import { describe, expect, it } from "vitest";
import { buildGoogleQueries } from "./listupDiscovery";
import {
  contactSearchRequest,
  discoverySearchRequest,
  nextSearchRunAction,
} from "./searchRunOrchestrator";

describe("search-run orchestration", () => {
  it("closes when the requested contactable-fit count is reached", () => {
    expect(
      nextSearchRunAction({
        requestedCount: 5,
        qualifiedCount: 5,
        retryableContactCount: 2,
        discoveryRounds: 1,
        maxDiscoveryRounds: 3,
        canVaryDiscoveryQuery: true,
      }),
    ).toBe("completed");
  });

  it("tries a different lead search before discovering another company", () => {
    expect(
      nextSearchRunAction({
        requestedCount: 5,
        qualifiedCount: 2,
        retryableContactCount: 1,
        discoveryRounds: 1,
        maxDiscoveryRounds: 3,
        canVaryDiscoveryQuery: true,
      }),
    ).toBe("contact_research");
    expect(contactSearchRequest(2)).toContain(
      "contact_strategy:functional_leads",
    );
  });

  it("uses a bounded, query-varied discovery follow-up for unfit candidates", () => {
    expect(
      nextSearchRunAction({
        requestedCount: 5,
        qualifiedCount: 2,
        retryableContactCount: 0,
        discoveryRounds: 1,
        maxDiscoveryRounds: 3,
        canVaryDiscoveryQuery: true,
      }),
    ).toBe("company_discovery");
    expect(discoverySearchRequest(2, 3)).toEqual([
      "discovery_round:2",
      "discovery_limit:3",
    ]);
    const source = {
      key: "Google",
      name: "Google",
      entryUrls: [],
      query: "B2C",
    };
    const filters = {
      industries: [],
      keywords: [],
      regions: [],
      companyStages: [],
      excludedCompanyIds: [],
      additionalConditions: null,
    };
    expect(buildGoogleQueries(source, filters, 2)).not.toEqual(
      buildGoogleQueries(source, filters, 1),
    );
  });

  it("partially completes after the third discovery round", () => {
    expect(
      nextSearchRunAction({
        requestedCount: 5,
        qualifiedCount: 2,
        retryableContactCount: 0,
        discoveryRounds: 3,
        maxDiscoveryRounds: 3,
        canVaryDiscoveryQuery: true,
      }),
    ).toBe("partially_completed");
  });
});
