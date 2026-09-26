import type { Company } from "@/generated/prisma";

// 명세 §3.2 Company — 기업 "식별 정보"만 담는다. product/domain이나 제외 플래그처럼
// 발송 업무가 쓰는 값은 여기 넣지 않는다(컨택 건 상세의 company 하위 객체에 있다).
export function serializeCompany(company: Company) {
  return {
    id: company.id,
    name: company.name,
    legal_name: company.legalName,
    aliases: company.aliases,
    website_url: company.websiteUrl,
    canonical_domain: company.canonicalDomain,
    created_at: company.createdAt.toISOString(),
    updated_at: company.updatedAt.toISOString(),
  };
}
