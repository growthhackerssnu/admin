// jointips.or.kr(TIPS, 한국엔젤투자협회 운영)의 "창업기업 소개" 페이지가 쓰는
// 공개 REST API다. 로그인·토큰 불필요. 페이지 JS(StartupPublicRestController 호출부)를
// 그대로 따른 것이며, robots.txt에도 별도 차단이 없다.
export const TIPS_API_BASE = "https://jointips.or.kr/api/cms/public/startup";
export const TIPS_PARSER_VERSION = "tips-public-api-v1";
export const TIPS_PAGE_SIZE = 100;

export type TipsStartupRecord = {
  id: string;
  name: string;
  ceo?: string;
  industry12Codes?: string;
  industryStdCodes?: string;
  regionCd?: string;
  sigunguNm?: string;
  estDt?: string;
  homepageUrl?: string;
  intro?: string;
  selYear?: string;
  tipsTracks?: string;
  operatorName?: string;
  bizAgeCode?: string;
};

export type TipsFilterOption = { value: string; label: string };

export type TipsFilterMap = {
  industryStd?: TipsFilterOption[];
  industry12?: TipsFilterOption[];
  region?: TipsFilterOption[];
  track?: TipsFilterOption[];
  age?: TipsFilterOption[];
};

export type TipsCompany = {
  externalKey: string;
  name: string;
  summary: string;
  detailUrl: string;
};

export function tipsListUrl(page: number, size = TIPS_PAGE_SIZE) {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    sort: "name",
    dir: "asc",
  });
  return `${TIPS_API_BASE}/list?${params.toString()}`;
}

export const TIPS_FILTERS_URL = `${TIPS_API_BASE}/filters`;

export function tipsDetailUrl(id: string) {
  return `https://jointips.or.kr/network/startups/detail?companyId=${encodeURIComponent(id)}`;
}

function parseCodeArray(raw: string | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function labelFor(options: TipsFilterOption[] | undefined, code: string) {
  return options?.find((option) => option.value === code)?.label ?? code;
}

export function parseTipsListResponse(json: unknown) {
  if (
    !json ||
    typeof json !== "object" ||
    (json as { code?: unknown }).code !== 200 ||
    !Array.isArray((json as { data?: unknown }).data)
  )
    throw new Error("Unexpected TIPS list response shape.");
  const body = json as { data: TipsStartupRecord[]; total: unknown };
  return { records: body.data, total: Number(body.total) || 0 };
}

export function parseTipsFiltersResponse(json: unknown): TipsFilterMap {
  if (
    !json ||
    typeof json !== "object" ||
    (json as { code?: unknown }).code !== 200 ||
    !(json as { data?: unknown }).data ||
    typeof (json as { data?: unknown }).data !== "object"
  )
    throw new Error("Unexpected TIPS filters response shape.");
  return (json as { data: TipsFilterMap }).data;
}

export function toTipsCompany(
  record: TipsStartupRecord,
  filters: TipsFilterMap,
): TipsCompany {
  const industries = [
    ...parseCodeArray(record.industryStdCodes).map((code) =>
      labelFor(filters.industryStd, code),
    ),
    ...parseCodeArray(record.industry12Codes).map((code) =>
      labelFor(filters.industry12, code),
    ),
  ];
  const tracks = parseCodeArray(record.tipsTracks).map((code) =>
    labelFor(filters.track, code),
  );
  const region = record.regionCd ? labelFor(filters.region, record.regionCd) : null;
  const location = [region, record.sigunguNm].filter(Boolean).join(" ");

  const composedParts = [
    record.selYear ? `${record.selYear}년 TIPS 선정` : null,
    tracks.length ? tracks.join("/") : null,
    industries.length ? industries.join(", ") : null,
    location || null,
    record.operatorName ? `운영사 ${record.operatorName}` : null,
  ].filter((part): part is string => Boolean(part));

  const intro = record.intro?.trim();
  const summary = (intro && intro.length ? intro : composedParts.join(" · ")) || "TIPS 선정기업";

  return {
    externalKey: record.id,
    name: record.name.trim(),
    summary: summary.slice(0, 500),
    detailUrl: tipsDetailUrl(record.id),
  };
}
