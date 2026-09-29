import type { Company } from "@/generated/prisma";

// 기업 "식별 정보"만 담는다. product/domain이나 제외 플래그처럼 발송 업무가 쓰는 값은
// 여기 넣지 않는다(컨택 건 상세의 company 하위 객체에 있다).
export function serializeCompany(company: Company) {
  return {
    id: company.id,
    name: company.name,
    legalName: company.legalName,
    aliases: company.aliases,
    websiteUrl: company.websiteUrl,
    canonicalDomain: company.canonicalDomain,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}
