// 썸네일이 하나도 없는 기업(홈페이지에 없고, 백서 본문 첫 블록도 이미지가 아닌 옛 프로젝트 등)의
// 로고. 인터넷에서 찾은 공식 로고를 다른 썸네일과 같은 모양(640×360 흰 바탕 가운데)으로 만들어
// Supabase Storage "hr-profile-photos/company-logos/"에 올려두고 URL만 여기 적는다
// (../data/companyLogos.json, 기업명 → URL·원본 출처). 같은 기업의 다른 프로젝트에 썸네일이
// 있으면 그쪽이 먼저다(whitepapers.ts resolveThumbnails).
import data from "../data/companyLogos.json";

export type CompanyLogoRecord = { url: string; sourceUrl: string };

const logos = data as Record<string, CompanyLogoRecord>;

// 기업명은 프로젝트 제목에서 분기 괄호를 뗀 것(projectTextMatch.ts companyName).
export function companyLogoUrl(company: string): string | null {
  return logos[company]?.url ?? null;
}
