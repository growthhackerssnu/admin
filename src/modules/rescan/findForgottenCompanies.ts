import { prisma } from "../../lib/prisma";
import { checkCooldownGate } from "../sourcing/cooldownGate";
import type { Company } from "@prisma/client";

/**
 * "잊혀진 기업 재추천"의 기반: 과거에 거절됐지만 쿨다운(타이밍 문제로 재조사 가능,
 * COOLDOWN_ELIGIBLE) 기간이 지난 기업을 찾는다. 영구 제외되거나, 아직 쿨다운 중이거나,
 * 다른 실행에서 이미 진행 중인 기업은 checkCooldownGate가 걸러준다 — 소싱 파이프라인의
 * 게이팅 규칙과 반드시 동일해야 하므로 그 함수를 그대로 재사용한다.
 */
export async function findForgottenCompanies(): Promise<Company[]> {
  const candidates = await prisma.company.findMany({
    where: {
      runCompanies: {
        some: { decisions: { some: { action: "REJECT", cooldownClass: "COOLDOWN_ELIGIBLE" } } },
      },
    },
  });

  const eligible: Company[] = [];
  for (const company of candidates) {
    const gate = await checkCooldownGate(company.domain);
    if (gate.eligible) eligible.push(company);
  }
  return eligible;
}
