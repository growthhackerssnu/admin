import { describe, expect, it } from "vitest";
import {
  buildResearchSearches,
  selectResearchUrls,
  validExtractedClaims,
} from "./companyResearch";

const company = {
  name: "Example Labs",
  legalName: null,
  aliases: ["Example"],
  websiteUrl: null,
};

describe("company research search limits", () => {
  it("uses two focused search requests for a new company", () => {
    expect(buildResearchSearches(company, [])).toHaveLength(2);
  });

  it("skips profile search for a verified website and uses the human request", () => {
    const searches = buildResearchSearches(
      { ...company, websiteUrl: "https://example.com" },
      ["pricing model"],
    );
    expect(searches).toHaveLength(1);
    expect(searches[0]?.key).toBe("followup");
    expect(searches[0]?.input).toContain("pricing model");
  });

  it("reads no more than six distinct direct URLs", () => {
    const urls = selectResearchUrls("https://example.com", [
      {
        text: "",
        sourceUrls: Array.from(
          { length: 8 },
          (_, index) => `https://source${index}.example.com`,
        ),
        webSearchCallCount: 1,
        inputTokens: 1,
        outputTokens: 1,
      },
    ]);
    expect(urls).toHaveLength(6);
    expect(urls[0]).toBe("https://example.com");
  });
});

describe("claim evidence checks", () => {
  const page = {
    url: "https://example.com",
    title: "Example Labs",
    text: "Example Labs sells a subscription analytics product.",
    entityMatched: true,
  };

  it("keeps only a claim whose quote is in the matched source page", () => {
    expect(
      validExtractedClaims(
        [
          {
            category: "product_service",
            content: "구독형 분석 제품을 제공한다.",
            pageIndex: 0,
            quote: "Example Labs sells a subscription analytics product.",
          },
          {
            category: "revenue_model",
            content: "근거 없는 주장",
            pageIndex: 0,
            quote: "not in the source",
          },
        ],
        [page],
      ),
    ).toHaveLength(1);
  });
});
