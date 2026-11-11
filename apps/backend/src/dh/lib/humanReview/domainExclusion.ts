import { prisma } from "@/lib/prisma";

// 학회 프로젝트와 맞지 않는 도메인을 TIPS 산업분류 코드로 거른다.
// 제외 코드가 하나라도 있고 소프트웨어 코드가 하나도 없으면 제외한다(경계 기업은 남긴다).
// 근거: 사람이 판단한 후보 중 TIPS에 있는 fit 부적합 19건은 모두 걸리고 승인 4건은 하나도 걸리지 않았다.
// StartupRecipe 후보는 같은 Company에 TIPS 코드가 붙은 경우(이름 일치)에만 걸린다.
const EXCLUDED: Record<string, string> = {
  "std:BIO_MED": "바이오·의료",
  "std:CHEM": "화학",
  "std:ELEC": "전기·전자",
  "std:ENERGY_RES": "에너지·자원",
  "std:CERAMIC": "세라믹",
  "i12:BIO": "생명·신약",
  "i12:SEMI": "반도체",
  "i12:ENERGY": "에너지·핵융합",
  "i12:ECO": "친환경",
};
const SOFTWARE = new Set(["std:ICT", "std:KNOW_SVC", "i12:AI", "i12:CONTENT"]);

export function domainExclusion(codes: string[]) {
  if (codes.some((code) => SOFTWARE.has(code))) return null;
  const labels = codes.flatMap((code) => (EXCLUDED[code] ? [EXCLUDED[code]] : []));
  if (!labels.length) return null;
  return { category: labels[0]!, reason: `TIPS 산업분류: ${labels.join(", ")} (소프트웨어 분류 없음)` };
}

// 미검토 후보 중 아직 판정하지 않았고 사람이 복원하지 않은 후보에 규칙을 적용한다.
export async function applyDomainExclusion() {
  const rows = await prisma.candidate.findMany({
    where: {
      reviewStatus: "unreviewed",
      autoExcludedAt: null,
      autoExclusionRestoredAt: null,
      company: { industryCodes: { isEmpty: false } },
    },
    select: { id: true, company: { select: { industryCodes: true } } },
  });
  const now = new Date();
  let excluded = 0;
  for (const row of rows) {
    const verdict = domainExclusion(row.company.industryCodes);
    if (!verdict) continue;
    // 판정 사이에 검토가 시작됐으면 건드리지 않는다.
    const updated = await prisma.candidate.updateMany({
      where: { id: row.id, reviewStatus: "unreviewed", autoExcludedAt: null, autoExclusionRestoredAt: null },
      data: { autoExcludedAt: now, autoExcludedCategory: verdict.category, autoExcludedReason: verdict.reason },
    });
    excluded += updated.count;
  }
  return { checked: rows.length, excluded };
}
