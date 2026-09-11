import { prisma } from "../../lib/prisma";

/** URL 유무·프로토콜·www.·트레일링 슬래시 차이를 흡수해 도메인을 비교 가능한 키로 정규화한다. */
export function normalizeDomain(rawDomain: string): string {
  let domain = rawDomain.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.replace(/\/.*$/, "");
  return domain;
}

export type GateResult =
  | { eligible: true }
  | { eligible: false; reason: "permanent_disqualify" | "cooldown_active" | "already_in_progress" };

const ACTIVE_PURSUIT_STATUSES = ["APPROVED", "RESEARCHING", "CONTACTS_READY"] as const;

/**
 * 이 도메인의 회사를 새 RUN_COMPANY 후보로 다시 올려도 되는지 판단한다.
 * - 과거 거절이 영구 제외로 분류됐다면 항상 제외.
 * - 쿨다운 기간 중이면 그 기간 동안 제외.
 * - 다른 실행에서 이미 승인/조사 중이면(중복 동시 아웃리치 방지) 제외.
 */
export async function checkCooldownGate(domain: string): Promise<GateResult> {
  const normalized = normalizeDomain(domain);

  const company = await prisma.company.findUnique({
    where: { domain: normalized },
    include: {
      runCompanies: {
        include: { decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!company) return { eligible: true };

  const isActivelyPursued = company.runCompanies.some((rc) =>
    ACTIVE_PURSUIT_STATUSES.includes(rc.status as (typeof ACTIVE_PURSUIT_STATUSES)[number]),
  );
  if (isActivelyPursued) return { eligible: false, reason: "already_in_progress" };

  const latestDecision = company.runCompanies
    .flatMap((rc) => rc.decisions)
    .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())[0];

  if (!latestDecision || latestDecision.action !== "REJECT") return { eligible: true };

  if (latestDecision.cooldownClass === "PERMANENT_DISQUALIFY") {
    return { eligible: false, reason: "permanent_disqualify" };
  }
  if (latestDecision.cooldownClass === "COOLDOWN_ELIGIBLE" && latestDecision.cooldownUntil) {
    if (latestDecision.cooldownUntil.getTime() > Date.now()) {
      return { eligible: false, reason: "cooldown_active" };
    }
  }

  return { eligible: true };
}
