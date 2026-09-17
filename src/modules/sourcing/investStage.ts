/**
 * 스타트업레시피 투자정보의 `단계` 컬럼을 우리 기준으로 정규화한다.
 *
 * 원문 표기가 투자 라운드(시드, 시리즈A…)와 비투자 이벤트(지원금, 인수합병, 기타(비공개))를
 * 한 컬럼에 섞어서 준다. 특히 `지원금`은 전량 팁스(TIPS) 선정 건인데, 라벨만 보면 정부
 * 보조금을 받은 영세기업으로 오해하기 쉽다.
 *
 * 팁스는 민간투자주도형 프로그램이라 선정되려면 팁스 운영사(액셀러레이터·VC)가 먼저
 * 자기 돈으로 투자해야 한다(2026년 기준 수도권 2억, 비수도권 1억). 즉 팁스 선정 기업은
 * 실질적으로 시드 라운드를 마친 상태이고, 민간 운영사와 정부 심사를 모두 통과했다는 점에서
 * 검증이 한 겹 더 있다. 그래서 SEED로 매핑하되, 승인 카드를 보는 사람이 맥락을 알 수 있게
 * 표시 문자열은 "시드(팁스)"로 남긴다.
 *
 * 팁스가 아닌 지원금은 선투자 전제가 없어 단계를 추정할 근거가 없으므로 UNKNOWN으로 둔다.
 */

export type CanonicalStage =
  | "PRE_SEED"
  | "SEED"
  | "PRE_SERIES_A"
  | "SERIES_A"
  /** 시리즈B 이상. 임직원 수·예산 규모가 목표 조건을 벗어난다. */
  | "LATER"
  /** 인수합병, 기타(비공개), 비팁스 지원금 등 단계를 알 수 없는 건. */
  | "UNKNOWN";

export type NormalizedStage = {
  canonical: CanonicalStage;
  /** Company.fundingStage에 저장하고 승인 카드에 노출할 문자열 */
  display: string;
  /** 팁스 선정 건인지 (prescore 가점과 Evidence 기록에 쓴다) */
  isTips: boolean;
};

/** 현재 WorkflowConfig의 "Seed~Series A"에 해당하는 단계. */
export const EARLY_STAGES: readonly CanonicalStage[] = ["PRE_SEED", "SEED", "PRE_SERIES_A", "SERIES_A"];

const DIRECT_MAP: Record<string, CanonicalStage> = {
  프리시드: "PRE_SEED",
  시드: "SEED",
  프리시리즈A: "PRE_SERIES_A",
  시리즈A: "SERIES_A",
  시리즈B: "LATER",
  프리시리즈B: "LATER",
  시리즈C: "LATER",
  시리즈D: "LATER",
  시리즈E: "LATER",
  프리IPO: "LATER",
};

function isTipsRound(investors: string[]): boolean {
  return investors.some((investor) => investor.includes("팁스"));
}

export function normalizeStage(rawStage: string, investors: string[]): NormalizedStage {
  const stage = rawStage.trim();

  if (stage === "지원금") {
    if (isTipsRound(investors)) {
      return { canonical: "SEED", display: "시드(팁스)", isTips: true };
    }
    // 팁스가 아닌 지원금은 민간 선투자 전제가 없어 단계를 추정할 근거가 없다.
    return { canonical: "UNKNOWN", display: "지원금", isTips: false };
  }

  const canonical = DIRECT_MAP[stage];
  if (canonical) {
    return { canonical, display: stage, isTips: isTipsRound(investors) };
  }

  return { canonical: "UNKNOWN", display: stage || "미상", isTips: false };
}

export function isEarlyStage(stage: NormalizedStage): boolean {
  return EARLY_STAGES.includes(stage.canonical);
}
