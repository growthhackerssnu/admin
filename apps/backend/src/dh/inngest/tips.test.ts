import { describe, expect, it } from "vitest";
import {
  parseTipsFiltersResponse,
  parseTipsListResponse,
  tipsDetailUrl,
  tipsListUrl,
  toTipsCompany,
} from "./tips";

describe("TIPS public API collection", () => {
  it("builds a paginated list URL", () => {
    expect(tipsListUrl(2, 50)).toBe(
      "https://jointips.or.kr/api/cms/public/startup/list?page=2&size=50&sort=name&dir=asc",
    );
  });

  it("builds a stable detail URL from the company id", () => {
    expect(tipsDetailUrl("abc-123")).toBe(
      "https://jointips.or.kr/network/startups/detail?companyId=abc-123",
    );
  });

  it("extracts records and total from the real list response shape", () => {
    const json = {
      code: 200,
      data: [{ id: "1", name: "테스트기업" }],
      total: 4588,
      page: 1,
      size: 1,
    };
    expect(parseTipsListResponse(json)).toEqual({
      records: json.data,
      total: 4588,
    });
  });

  it("rejects a response that isn't the expected success shape", () => {
    expect(() => parseTipsListResponse({ code: 404, message: "not found" })).toThrow();
    expect(() => parseTipsListResponse(null)).toThrow();
  });

  it("extracts the filter code→label map", () => {
    const json = {
      code: 200,
      data: { region: [{ value: "11", label: "서울" }] },
    };
    expect(parseTipsFiltersResponse(json)).toEqual(json.data);
  });

  it("prefers the company's own intro over the composed summary", () => {
    const company = toTipsCompany(
      { id: "1", name: "1인치", intro: "선결제 빅데이터 플랫폼입니다.", selYear: "2023" },
      {},
    );
    expect(company.summary).toBe("선결제 빅데이터 플랫폼입니다.");
    expect(company.externalKey).toBe("1");
    expect(company.detailUrl).toBe(
      "https://jointips.or.kr/network/startups/detail?companyId=1",
    );
  });

  it("composes a summary from codes and labels when intro is missing", () => {
    const filters = {
      industryStd: [{ value: "BIO_MED", label: "바이오·의료" }],
      industry12: [{ value: "BIO", label: "생명·신약" }],
      region: [{ value: "11", label: "서울" }],
      track: [{ value: "GENERAL", label: "일반" }],
    };
    const company = toTipsCompany(
      {
        id: "2",
        name: "마이트렉스코리아",
        industryStdCodes: '["BIO_MED"]',
        industry12Codes: '["BIO"]',
        regionCd: "11",
        sigunguNm: "강남구",
        selYear: "2022",
        tipsTracks: '["GENERAL"]',
        operatorName: "에이치지이니셔티브",
        estDt: "2021-06-18",
      },
      filters,
    );
    expect(company.summary).toBe(
      "2022년 TIPS 선정 · 일반 · 바이오·의료, 생명·신약 · 서울 강남구 · 운영사 에이치지이니셔티브",
    );
  });

  it("falls back to a generic summary when nothing is available", () => {
    const company = toTipsCompany({ id: "3", name: "빈정보기업" }, {});
    expect(company.summary).toBe("TIPS 선정기업");
  });
});
