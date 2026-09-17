/**
 * LLM을 태우기 전 규칙 기반 우선순위 점수.
 *
 * 스타트업레시피 커넥터는 3개월치만 모아도 400건이 넘는 후보를 준다. 전부 LLM으로
 * 평가하면 비용이 감당되지 않으므로, 커넥터가 이미 준 정보(단계·분야·일자·투자사·투자금)만으로
 * 순위를 매겨 상위 N건만 조사 단계로 넘긴다. 이 단계는 Claude를 호출하지 않는다.
 *
 * 점수는 사람이 검토할 수 있어야 한다. 승인 카드에 "왜 이 회사가 올라왔는지"를 설명해야 하고,
 * 기준이 틀렸을 때 어디를 고쳐야 하는지 드러나야 하기 때문에, 점수와 함께 근거 문자열을
 * 같이 반환한다.
 */
import type { InvestRound } from "./investRounds";
import { isEarlyStage, normalizeStage, type NormalizedStage } from "./investStage";

export type PrescoredCandidate = {
  round: InvestRound;
  stage: NormalizedStage;
  /** 0.0~1.0 */
  score: number;
  /** 점수 근거. 승인 카드와 디버깅에 쓴다. */
  reasons: string[];
};

/**
 * 학회 역량과 직접 맞닿는 키워드. 분야 컬럼이 분류 체계가 아니라 한 줄 설명문이라
 * (3개월 425건에 405종) 문자열 매칭 대신 키워드 포함 여부로 판단한다.
 *
 * TODO: WorkflowConfig에서 학회별/기수별로 조정할 수 있게 옮긴다. 지금은 비즈니스 데이터
 * 학회 기준 고정값이다.
 */
const CORE_KEYWORDS = [
  "AI", "인공지능", "데이터", "분석", "머신러닝", "딥러닝", "추천", "예측", "LLM", "에이전트",
];

/** 데이터 과제로 이어질 여지가 있는 인접 영역. CORE보다 낮게 준다. */
const ADJACENT_KEYWORDS = [
  "플랫폼", "SaaS", "솔루션", "커머스", "핀테크", "마케팅", "물류", "구독", "자동화", "매칭",
];

/**
 * 단계별 적합도. 프리시리즈A가 가장 이상적이다 — 외주에 쓸 예산이 생겼는데 조직은 아직 작다.
 * 값을 미세하게 벌려둔 이유는, 구간마다 같은 값을 주면 상위권이 전부 동점이 되어
 * 사실상 날짜순 정렬로 무너지기 때문이다(초기 구현에서 실제로 상위 20건이 전부 동점이었다).
 */
const STAGE_FIT: Record<string, number> = {
  PRE_SERIES_A: 1.0,
  SEED: 0.92,
  SERIES_A: 0.85,
  // 프리시드는 협업에 쓸 예산이 없는 경우가 많아 낮춘다.
  PRE_SEED: 0.5,
};

/** 투자 공시 후 며칠이 지나면 점수가 절반이 되는지. 자금 집행 시점에 가까울수록 좋다. */
const RECENCY_HALF_LIFE_DAYS = 45;

const WEIGHTS = { stage: 0.4, sector: 0.35, recency: 0.15, signal: 0.1 } as const;

function matchedKeywords(sector: string | null, keywords: string[]): string[] {
  if (!sector) return [];
  const haystack = sector.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

/** 구간 함수 대신 완만한 감쇠를 쓴다. 0일=1.0, 45일=0.5, 90일=0.33. */
function recencyScore(days: number): number {
  return 1 / (1 + days / RECENCY_HALF_LIFE_DAYS);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function prescoreRound(round: InvestRound, now: Date = new Date()): PrescoredCandidate {
  const stage = normalizeStage(round.stage, round.investors);
  const reasons: string[] = [];

  const stageFit = STAGE_FIT[stage.canonical] ?? 0;
  reasons.push(`단계 ${stage.display}`);

  const core = matchedKeywords(round.sector, CORE_KEYWORDS);
  const adjacent = matchedKeywords(round.sector, ADJACENT_KEYWORDS);
  // 키워드가 몇 개 걸렸는지까지 반영한다. "AI"만 걸린 회사와 "AI·데이터·분석"이 걸린 회사를
  // 같은 점수로 두면 상위권이 동점으로 뭉개진다.
  const sectorFit = clamp01(0.2 + 0.3 * core.length + 0.12 * adjacent.length);
  if (core.length > 0) {
    reasons.push(`핵심 분야 키워드 ${core.join("·")}`);
  }
  if (adjacent.length > 0) {
    reasons.push(`인접 분야 키워드 ${adjacent.join("·")}`);
  }
  if (core.length === 0 && adjacent.length === 0) {
    // 완전히 배제하지는 않는다. 키워드는 학회 기준 근사치일 뿐이라 하드 필터로 쓰면
    // 표현이 다른 좋은 후보를 놓친다. 순위만 낮춰서 상위 N 밖으로 밀어낸다.
    reasons.push("분야 키워드 미매칭");
  }

  const days = daysSince(round.announcedAt, now);
  const recency = recencyScore(days);
  reasons.push(`공시 ${days}일 전`);

  // 팁스는 민간 운영사 선투자 + 정부 심사를 모두 통과했다는 뜻이라 검증 신호로 가점한다.
  let signal = 0;
  if (stage.isTips) {
    signal += 0.35;
    reasons.push("팁스 선정");
  }
  // 팁스 건은 투자사 칸에 프로그램명("팁스", "스케일업팁스"…)만 들어온다. 이걸 투자사로 세면
  // 위에서 이미 준 팁스 가점이 이중으로 들어가고, 근거 문구도 사실과 달라진다.
  const realInvestors = round.investors.filter((investor) => !investor.includes("팁스"));
  if (realInvestors.length > 0) {
    signal += Math.min(0.3, 0.1 * realInvestors.length);
    reasons.push(`투자사 ${realInvestors.length}곳 참여`);
  }
  // 투자금이 목표 규모대(1억~150억)에 들어오면 가점. 68%가 비공개라 주 가중치로는 쓸 수 없다.
  if (round.amountMillionKrw !== null) {
    const inBand = round.amountMillionKrw >= 100 && round.amountMillionKrw <= 15_000;
    signal += inBand ? 0.2 : 0.1;
    reasons.push(`투자금 ${round.amountText}`);
  }
  signal = clamp01(signal);

  const score =
    WEIGHTS.stage * stageFit +
    WEIGHTS.sector * sectorFit +
    WEIGHTS.recency * recency +
    WEIGHTS.signal * signal;

  return { round, stage, score: Number(score.toFixed(4)), reasons };
}

/**
 * 초기 단계 후보만 남겨 점수순으로 정렬한다.
 * limit을 주면 상위 limit건만 반환한다(LLM 조사 대상).
 */
export function prescoreRounds(
  rounds: InvestRound[],
  options: { limit?: number; now?: Date } = {},
): PrescoredCandidate[] {
  const now = options.now ?? new Date();

  const scored = rounds
    .map((round) => prescoreRound(round, now))
    .filter((candidate) => isEarlyStage(candidate.stage))
    .sort((a, b) => b.score - a.score || b.round.announcedAt.getTime() - a.round.announcedAt.getTime());

  return options.limit === undefined ? scored : scored.slice(0, options.limit);
}
