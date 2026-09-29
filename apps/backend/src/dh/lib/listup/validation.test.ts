import { describe, expect, it } from "vitest";
import { createSearchRunSchema } from "./validation";

const validInput = {
  targetQuarterId: "quarter-1",
  sources: [{ key: "Google", name: "Google", entryUrls: [], query: null }],
  filters: {
    industries: [],
    keywords: [],
    regions: [],
    companyStages: [],
    excludedCompanyIds: [],
    additionalConditions: null,
  },
  maxCompanies: 10,
};

describe("createSearchRunSchema", () => {
  it("accepts the user-selected discovery limit at both boundaries", () => {
    expect(
      createSearchRunSchema.safeParse({ ...validInput, maxCompanies: 1 })
        .success,
    ).toBe(true);
    expect(
      createSearchRunSchema.safeParse({ ...validInput, maxCompanies: 30 })
        .success,
    ).toBe(true);
  });

  it("rejects an out-of-range or missing discovery limit", () => {
    expect(
      createSearchRunSchema.safeParse({ ...validInput, maxCompanies: 0 })
        .success,
    ).toBe(false);
    expect(
      createSearchRunSchema.safeParse({ ...validInput, maxCompanies: 31 })
        .success,
    ).toBe(false);
    expect(
      createSearchRunSchema.safeParse({
        ...validInput,
        maxCompanies: undefined,
      }).success,
    ).toBe(false);
  });
});
