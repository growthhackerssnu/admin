/**
 * 스타트업레시피 투자정보(https://startuprecipe.co.kr/invest) 커넥터.
 *
 * 뉴스 헤드라인에서 회사명을 추측하던 기존 RSS 경로와 달리, 이 페이지는 사람이 큐레이션한
 * 투자 유치 내역을 표로 제공한다. 기업명이 정식 사명으로 주어지고 분야·투자단계가 이미
 * 채워져 있어서, 소싱 단계에서 LLM이 조사해야 할 항목이 도메인과 임직원 수 두 개로 줄어든다.
 *
 * 페이지는 서버 렌더링 HTML 테이블이고 페이지네이션이 없다. 월 필터 한 번이 그 달 전체이므로
 * 한 달치 = HTTP 요청 1회다. robots.txt가 `User-agent: * / Disallow:`(전면 허용)이라
 * 직접 파싱해도 된다.
 *
 * HTML 파싱 라이브러리를 새로 넣는 대신 정규식으로 행을 뽑되, 헤더 행이 기대한 컬럼과
 * 일치하는지 매번 검증한다. 사이트가 개편되면 조용히 0건을 반환하는 대신 예외를 던져
 * 호출부(및 Slack 알림)가 문제를 인지할 수 있게 하기 위함이다.
 */

const INVEST_URL = "https://startuprecipe.co.kr/invest";

// 기본 Node User-Agent는 일부 WAF가 차단하므로 브라우저 UA를 쓴다(기존 RSS 커넥터와 동일한 이유).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 기대하는 테이블 헤더. 순서까지 일치해야 한다. */
const EXPECTED_HEADER = ["일자", "기업명", "분야", "투자금", "단계", "투자사"] as const;

export type InvestRound = {
  /** 투자 공시 일자 */
  announcedAt: Date;
  /** 정식 사명 (사람이 큐레이션한 값) */
  companyName: string;
  /** 사업 분야. Company.industry 후보로 쓴다. */
  sector: string | null;
  /** 원문 그대로의 투자금 표기 ("121억원", "비공개" 등) */
  amountText: string;
  /** 투자금을 백만원 단위로 정규화한 값. 비공개/파싱 불가면 null. */
  amountMillionKrw: number | null;
  /** 투자 단계 원문 ("시리즈A", "시드", "지원금" 등) */
  stage: string;
  /** 투자사 목록. 비공개이거나 표기가 없으면 빈 배열. */
  investors: string[];
  /** 이 행을 가져온 월 필터 URL (Evidence 기록용) */
  sourceUrl: string;
};

export class InvestRoundsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvestRoundsParseError";
  }
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

/** 셀 안의 태그를 걷어내고 공백을 정규화한다. */
function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1] ?? ""));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/**
 * "121억원" → 12100, "5000만원" → 50, "비공개" → null.
 * 백만원 단위로 맞추는 이유: 억/만원이 섞여 들어와도 하나의 정수로 비교·정렬할 수 있어야
 * 이후 prescore 단계에서 투자금 규모를 가중치로 쓸 수 있기 때문이다.
 */
export function parseAmountToMillionKrw(amountText: string): number | null {
  const compact = amountText.replace(/[\s,]/g, "");

  const eok = compact.match(/([\d.]+)억/);
  const man = compact.match(/([\d.]+)만/);
  let total = 0;
  let matched = false;

  if (eok) {
    total += Number(eok[1]) * 100; // 1억원 = 100백만원
    matched = true;
  }
  if (man) {
    total += Number(man[1]) / 100; // 1만원 = 0.01백만원
    matched = true;
  }

  if (!matched) return null;
  return Number.isFinite(total) ? Math.round(total) : null;
}

/** "A, B, C" 형태의 투자사 표기를 배열로 쪼갠다. 비공개/미표기는 빈 배열. */
function parseInvestors(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "-" || trimmed === "비공개") return [];
  return trimmed
    .split(/[,·]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseAnnouncedAt(text: string): Date | null {
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  // 월 필터로 받은 날짜는 KST 기준 날짜 문자열이므로 UTC 자정으로 고정해 저장한다.
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 월 필터 URL 하나를 받아 파싱한다. year=2026, month=8 형태로 넘긴다. */
export function buildMonthUrl(year: number, month: number): string {
  return `${INVEST_URL}?m_year=${year}&m_month=${String(month).padStart(2, "0")}`;
}

/**
 * 한 달치 투자 유치 내역을 가져온다.
 * 헤더 구조가 바뀌었으면 InvestRoundsParseError를 던진다(조용한 0건 반환 방지).
 */
export async function fetchInvestRoundsForMonth(year: number, month: number): Promise<InvestRound[]> {
  const url = buildMonthUrl(year, month);

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new InvestRoundsParseError(`${url} 요청 실패: HTTP ${response.status}`);
  }

  const html = await response.text();
  const rows = parseRows(html);
  if (rows.length === 0) {
    throw new InvestRoundsParseError(`${url}: 테이블 행을 하나도 찾지 못했다 (페이지 구조 변경 의심)`);
  }

  const header = rows[0] ?? [];
  const headerMatches =
    header.length >= EXPECTED_HEADER.length &&
    EXPECTED_HEADER.every((expected, i) => header[i] === expected);
  if (!headerMatches) {
    throw new InvestRoundsParseError(
      `${url}: 테이블 헤더가 기대와 다르다. 기대=[${EXPECTED_HEADER.join(", ")}] 실제=[${header.join(", ")}]`,
    );
  }

  const results: InvestRound[] = [];
  for (const cells of rows.slice(1)) {
    if (cells.length < EXPECTED_HEADER.length) continue;

    const [dateText = "", nameRaw = "", sectorRaw = "", amountRaw = "", stageRaw = "", investorsRaw = ""] = cells;

    const announcedAt = parseAnnouncedAt(dateText);
    const companyName = nameRaw.trim();
    // 날짜나 기업명이 없는 행은 구분선·안내 문구 등이므로 건너뛴다.
    if (!announcedAt || !companyName) continue;

    const amountText = amountRaw.trim();
    results.push({
      announcedAt,
      companyName,
      sector: sectorRaw.trim() || null,
      amountText,
      amountMillionKrw: parseAmountToMillionKrw(amountText),
      stage: stageRaw.trim(),
      investors: parseInvestors(investorsRaw),
      sourceUrl: url,
    });
  }

  return results;
}

/** 오늘 기준 최근 monthCount개월(이번 달 포함)의 (year, month) 목록을 최신순으로 만든다. */
export function recentMonths(monthCount: number, now: Date = new Date()): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  // KST 기준으로 "이번 달"을 계산한다(사이트가 한국 시간 기준으로 갱신되므로).
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let year = kst.getUTCFullYear();
  let month = kst.getUTCMonth() + 1;

  for (let i = 0; i < monthCount; i++) {
    months.push({ year, month });
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return months;
}

/**
 * 최근 여러 달치를 모아서 가져온다. 같은 기업이 여러 번 투자를 받았으면 가장 최근 건만 남긴다.
 * 월별 요청 사이에 간격을 둬서 상대 서버에 부담을 주지 않는다.
 */
export async function collectRecentInvestRounds(monthCount: number): Promise<InvestRound[]> {
  const all: InvestRound[] = [];

  for (const { year, month } of recentMonths(monthCount)) {
    const rounds = await fetchInvestRoundsForMonth(year, month);
    all.push(...rounds);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  all.sort((a, b) => b.announcedAt.getTime() - a.announcedAt.getTime());

  const seen = new Set<string>();
  return all.filter((round) => {
    const key = round.companyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
