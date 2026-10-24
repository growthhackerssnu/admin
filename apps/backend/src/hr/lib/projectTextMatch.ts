// 프로필 "Projects" 자유 텍스트의 각 줄이 어느 그핵 프로젝트(백서)를 가리키는지 찾는다.
//
// 실제 데이터(2026-10 전수 확인)는 거의 다 "기업 | 내용 | 2025.03 ~ 2025.06" 형태다.
// 같은 기업과 여러 분기에 걸쳐 한 경우(데이블 24.4Q·25.2Q)가 있어 기업명만으로는
// 모자라고, 줄의 시작 연월을 그핵 분기로 바꿔 함께 맞춘다. 그핵 분기는
// 1Q=1~2월(겨울), 2Q=3~6월(1학기), 3Q=7~8월(여름), 4Q=9~12월(2학기)이다.
//
// 기업명을 영어·옛 이름으로 쓴 줄("Riderdash")은 기업명으로 못 찾는다. 이때는 그
// 사람이 Notion "참여 프로젝트"로 연결된 프로젝트 중, 같은 분기에 하나뿐이고 다른
// 줄에서 이미 찾지 않은 것이면 그 줄로 본다.

export type MatchableProject = {
  notionPageId: string;
  title: string; // "데이블 (25.2Q)", "블리몽키즈 (25.1Q-S)"
  quarter: string | null; // "25-2Q"
  members: { notionPageId: string }[];
};

// 텍스트를 "\n"으로 나눈 줄마다 백서 ID(못 찾으면 null)를 돌려준다.
export function matchProjectLines(
  text: string,
  projects: MatchableProject[],
  personId: string,
): (string | null)[] {
  const lines = text.split("\n");
  const indexed = projects.map((p) => ({
    ...p,
    company: normalize(companyName(p.title)),
    quarterKey: projectQuarter(p.quarter),
    isMine: p.members.some((m) => m.notionPageId === personId),
    isSide: /-S\)\s*$/.test(p.title),
  }));
  const parsed = lines.map(parseLine);

  const result = parsed.map((line) => (line ? matchByCompany(line, indexed) : null));

  // 2차: 기업명으로 못 찾은 "기업 | 내용 | 기간" 줄을 본인 참여 프로젝트의 분기로 잇는다.
  const used = new Set(result.filter((id): id is string => id !== null));
  parsed.forEach((line, i) => {
    if (!line || result[i] || !line.hasSeparator || line.quarterKey === null) return;
    const mine = indexed.filter((p) => p.isMine && p.quarterKey === line.quarterKey && !used.has(p.notionPageId));
    const [only] = mine;
    if (mine.length === 1 && only) {
      result[i] = only.notionPageId;
      used.add(only.notionPageId);
    }
  });

  return result;
}

type ParsedLine = { head: string; hasSeparator: boolean; quarterKey: number | null };
type IndexedProject = MatchableProject & { company: string; quarterKey: number | null; isMine: boolean; isSide: boolean };

function parseLine(raw: string): ParsedLine | null {
  const line = raw.replace(/^\s*(?:[-•*·▪]|\d+[.)])\s*/, "").trim();
  if (!line) return null;
  const separator = line.indexOf("|");
  return {
    // 기업명은 첫 "|" 앞에서만 찾는다 — 설명 문장 속 단어(예: "프립")에 잘못 걸리지 않게.
    head: normalize(separator >= 0 ? line.slice(0, separator) : line),
    hasSeparator: separator >= 0,
    quarterKey: lineQuarter(line),
  };
}

function matchByCompany(line: ParsedLine, projects: IndexedProject[]): string | null {
  const hits = projects.filter((p) => p.company && line.head.includes(p.company));
  if (hits.length === 0) return null;
  // "파스토셀프"가 "파스토"에도 걸리므로 가장 긴 기업명만 남긴다.
  const longest = Math.max(...hits.map((p) => p.company.length));
  let candidates = hits.filter((p) => p.company.length === longest);

  // "|" 없는 줄은 긴 문장일 수 있어, 기간이 그 기업 프로젝트 분기와 맞을 때만 인정한다.
  if (!line.hasSeparator) {
    if (line.quarterKey === null) return null;
    candidates = candidates.filter((p) => p.quarterKey === line.quarterKey);
  } else if (line.quarterKey !== null) {
    const lineQuarterKey = line.quarterKey;
    const sameQuarter = candidates.filter((p) => p.quarterKey === lineQuarterKey);
    // 적은 기간과 DB 분기가 한 칸 어긋난 경우가 있다(현대홈쇼핑: DB 22.2Q, 프로필 2022.01~02).
    const adjacent = candidates.filter(
      (p) => p.quarterKey !== null && Math.abs(quarterIndex(p.quarterKey) - quarterIndex(lineQuarterKey)) === 1,
    );
    // 그래도 안 맞으면 본인이 참여한 것으로만 좁힌다.
    candidates =
      sameQuarter.length > 0 ? sameQuarter : adjacent.length > 0 ? adjacent : candidates.filter((p) => p.isMine);
  }
  return pickOne(candidates);
}

// 같은 분기에 본 프로젝트와 사이드 프로젝트(-S)가 함께 있으면 본인 참여 → 본 프로젝트 순.
function pickOne(candidates: IndexedProject[]): string | null {
  if (candidates.length <= 1) return candidates[0]?.notionPageId ?? null;
  const mine = candidates.filter((p) => p.isMine);
  if (mine.length === 1) return mine[0]?.notionPageId ?? null;
  const pool = mine.length > 1 ? mine : candidates;
  const main = pool.filter((p) => !p.isSide);
  return main.length === 1 ? (main[0]?.notionPageId ?? null) : null;
}

export function companyName(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

// "25-2Q" → 2502
function projectQuarter(quarter: string | null): number | null {
  const match = quarter?.match(/^(\d{2})-(\d)Q/);
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

// 2502 → 분기를 일렬로 센 번호(한 칸 차이를 재려고).
function quarterIndex(key: number): number {
  return Math.floor(key / 100) * 4 + (key % 100) - 1;
}

// 줄에서 처음 나오는 "2025.03"·"2025-03"·"2025년 3월"을 그핵 분기로 바꾼다.
function lineQuarter(line: string): number | null {
  const match = line.match(/(20\d{2})\s*(?:[./-]|년)\s*(\d{1,2})/);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const quarter = month <= 2 ? 1 : month <= 6 ? 2 : month <= 8 ? 3 : 4;
  return (Number(match[1]) % 100) * 100 + quarter;
}
