import { describe, expect, it } from "vitest";
import {
  buildGapSearch,
  buildResearchSearches,
  claimsFromExtraction,
  formatClaimContent,
  hasCompanyName,
  isAboutCompany,
  publishedAtFromHtml,
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
    publishedAt: null,
    text: "Example Labs sells a subscription analytics product.",
    entityMatched: true,
  };
  const names = ["Example Labs"];

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
        names,
      ),
    ).toHaveLength(1);
  });

  it("accepts a quote that differs only in spacing or punctuation", () => {
    expect(
      validExtractedClaims(
        [{ category: "product_service", content: "구독형 분석 제품 제공", pageIndex: 0,
          quote: "Example  Labs sells a subscription-analytics product" }],
        [page],
        names,
      ),
    ).toHaveLength(1);
  });

  it("fixes a wrong page index when the quote is on another page", () => {
    const other = { ...page, url: "https://other.example.com", text: "Example Labs news only." };
    const [claim] = validExtractedClaims(
      [{ category: "product_service", content: "분석 제품", pageIndex: 0,
        quote: "Example Labs sells a subscription analytics product." }],
      [other, page],
      names,
    );
    expect(claim?.pageIndex).toBe(1);
  });

  it("on a multi-company page, keeps only quotes naming the company", () => {
    const roundup = { ...page, title: "VC, 스타트업 8개사 신규 투자",
      text: "투자 대상은 ▲Example Labs ▲Other Co 등 8개사다. Other Co는 결제 앱을 운영한다. Example Labs는 분석 제품을 판매한다." };
    const claims = validExtractedClaims(
      [{ category: "product_service", content: "결제 앱", pageIndex: 0, quote: "Other Co는 결제 앱을 운영한다." },
        { category: "target_customer", content: "분석 제품", pageIndex: 0, quote: "Example Labs는 분석 제품을 판매한다." }],
      [roundup],
      names,
    );
    expect(claims.map((claim) => claim.category)).toEqual(["target_customer"]);
  });

  it("keeps only categories the model marked as found", () => {
    const claims = claimsFromExtraction({
      product_service: { found: true, content: "분석 제품 제공", pageIndex: 0, quote: "q" },
      revenue_model: { found: false, content: "", pageIndex: -1, quote: "" },
    });
    expect(claims.map((claim) => claim.category)).toEqual(["product_service"]);
  });

  it("drops a trailing 제공 from a named product list", () => {
    expect(formatClaimContent("product_service", { found: true, pageIndex: 0, quote: "q",
      content: "ND MARKET(B2B 커머스), 엉클POS 등 제공" })).toBe("ND MARKET(B2B 커머스), 엉클POS");
    expect(formatClaimContent("product_service", { found: true, pageIndex: 0, quote: "q",
      content: "태양광 O&M 구독 서비스 제공" })).toBe("태양광 O&M 구독 서비스 제공");
  });

  it("prefixes recent_change with the event month from eventMonth", () => {
    expect(formatClaimContent("recent_change", { found: true, pageIndex: 0, quote: "q",
      eventMonth: "2026-06", content: "2026년 7월 시리즈A 투자 유치" })).toBe("2026년 6월 시리즈A 투자 유치");
    expect(formatClaimContent("recent_change", { found: true, pageIndex: 0, quote: "q",
      eventMonth: "", content: "시리즈A 투자 유치" })).toBe("시리즈A 투자 유치");
  });

  it("reads the article date from meta tags", () => {
    expect(publishedAtFromHtml('<meta property="article:published_time" content="2025-03-14T09:00:00+09:00">')).toBe("2025-03-14T09:00:00+09:00");
    expect(publishedAtFromHtml("<title>no date</title>")).toBeNull();
  });

  it("asks the gap search only about missing categories", () => {
    const input = buildGapSearch(company, ["revenue_model"]);
    expect(input).toContain("수익 모델");
    expect(input).not.toContain("제품·서비스");
  });
});

describe("company name matching", () => {
  it("ignores spacing and punctuation differences", () => {
    expect(hasCompanyName("어니스트플라워는 꽃 구독 서비스입니다", ["어니스트 플라워"])).toBe(true);
    expect(hasCompanyName("Honest-Flower brand page", ["honest flower"])).toBe(true);
    expect(hasCompanyName("다른 회사 소개", ["어니스트 플라워"])).toBe(false);
  });

  it("treats a page as about the company only when the name is in the title or repeated", () => {
    expect(isAboutCompany("남도마켓 시리즈A 유치", "투자 소식", ["남도마켓"])).toBe(true);
    expect(isAboutCompany("기관 공지", "남도마켓은 ... 남도마켓의 ...", ["남도마켓"])).toBe(true);
    expect(isAboutCompany("기관 공지", "참여 기업: 가나, 남도마켓, 다라", ["남도마켓"])).toBe(false);
  });
});
