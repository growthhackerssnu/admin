import type { Company, ListupState } from "./model";

const shared = {
  possibility: "사용자 이용 흐름을 분석하고 안내 방식을 실험할 수 있습니다.",
  value: "핵심 전환율 개선이 반복 이용과 사업 성과에 기여할 가능성이 있습니다.",
};

export const sampleCompanies: Company[] = [
  {
    id: "morningloop", name: "모닝루프", service: "매일 이어가는 작은 학습 습관", area: "가입 후 첫 학습 전환", about: "짧은 오디오 콘텐츠로 매일 10분의 학습을 돕는 구독 서비스입니다.", fit: "fit",
    possibility: "가입부터 첫 콘텐츠 재생까지의 흐름을 분석하고 온보딩을 실험할 수 있습니다.", value: "첫 학습 경험은 반복 이용과 유료 구독 전환에 연결됩니다.",
    people: [{ id: "m1", name: "김서연", role: "Product Manager", email: "product@example.com", linkedin: "https://www.linkedin.com/" }],
  },
  {
    id: "foldmarket", name: "폴드마켓", service: "취향을 발견하는 라이프스타일 커머스", area: "첫 구매 전환 개선", about: "독립 브랜드와 고객을 연결하는 라이프스타일 커머스입니다.", fit: "fit",
    possibility: "상품 탐색부터 구매까지의 흐름과 상세 페이지를 실험할 수 있습니다.", value: "첫 구매 전환은 고객 획득 효율과 매출에 직접 연결됩니다.",
    people: [{ id: "f1", name: "이준호", role: "Growth Manager", email: "growth@example.com", linkedin: "https://www.linkedin.com/" }],
  },
  { id: "clearnote", name: "클리어노트", service: "작은 조직을 위한 업무 지식 도구", area: "핵심 사용 과정 확인 필요", about: "조직의 문서와 업무 지식을 모으는 협업 서비스입니다.", fit: "pending", possibility: "초기 정착에 개입할 가능성은 있지만 공개 정보로 사용 흐름을 확인하기 어렵습니다.", value: "수익 구조와 반복 이용 방식에 대한 정보가 더 필요합니다.", people: [] },
  { id: "obrit", name: "오브릿", service: "운동을 일상으로 만드는 멤버십", area: "첫 이용 후 재방문", about: "지역 운동 공간을 하나의 멤버십으로 이용하는 서비스입니다.", fit: "fit", possibility: "첫 예약 이후 재방문을 유도하는 경로를 실험할 수 있습니다.", value: "반복 예약률 개선은 멤버십 유지와 연결됩니다.", people: [] },
  { id: "passon", name: "패스온", service: "현장 운영을 위한 산업 솔루션", area: "실행 가능한 영역 미확인", about: "대규모 제조 현장에 맞춘 설비 운영 솔루션입니다.", fit: "unfit", possibility: "현장 설비와 장기 구축 과정에 대한 의존성이 높습니다.", value: "가치는 있지만 직접 개입 가능한 범위의 근거가 부족합니다.", people: [] },
  { id: "greenery", name: "그리너리", service: "취향에 맞춰 도착하는 식물 구독", area: "구독 상품 선택 과정", about: "고객의 생활환경에 맞춘 식물을 정기 배송합니다.", fit: "fit", possibility: "상품 추천 질문과 구독 선택 화면을 개선할 수 있습니다.", value: "선택의 어려움을 줄이면 구독 신청과 만족도에 기여할 수 있습니다.", people: [{ id: "g1", name: "박지우", role: "Co-founder", email: "hello@example.com", linkedin: "https://www.linkedin.com/" }] },
  { id: "milestone", name: "마일스톤", service: "커리어 전환을 위한 코호트 교육", area: "교육 신청 퍼널 분석", about: "직무 전환을 준비하는 고객을 위한 교육 프로그램입니다.", fit: "pending", possibility: "교육 신청 과정에 개입할 가능성이 있으나 운영 방식을 확인해야 합니다.", value: "신청 전환이 핵심 지표인지 확인이 필요합니다.", people: [] },
];

export const extraCompanies: Company[] = [
  { id: "brickletter", name: "브릭레터", service: "관심사 기반 뉴스레터 구독", area: "첫 이용 전환 개선", about: "관심사에 맞춘 뉴스레터를 제공합니다.", fit: "fit", people: [], ...shared },
  { id: "dayplan", name: "데이플랜", service: "개인 일정 관리 서비스", area: "첫 이용 전환 개선", about: "개인의 일정을 쉽게 정리하는 서비스입니다.", fit: "fit", people: [{ id: "d1", name: "김서연", role: "Product Manager", email: "product@example.com", linkedin: "https://www.linkedin.com/" }], ...shared },
  { id: "tableon", name: "테이블온", service: "로컬 식당 예약 서비스", area: "첫 이용 전환 개선", about: "지역 식당의 예약을 돕는 서비스입니다.", fit: "fit", people: [], ...shared },
];

export function initialState(): ListupState {
  return {
    quarter: "2026-Q4",
    companies: structuredClone(sampleCompanies),
    batches: [
      { id: "initial", quarter: "2026-Q4", condition: "프로덕트 성장 기회가 있는 기업", createdAt: "09.23 11:00", sources: ["Google", "뉴스레터"], companyIds: ["morningloop", "foldmarket", "clearnote"], excludedCount: 0 },
      { id: "commerce", quarter: "2026-Q4", condition: "커머스 · 라이프스타일 기업", createdAt: "09.24 14:30", sources: ["혁신의 숲"], companyIds: ["obrit", "passon", "greenery", "milestone"], excludedCount: 0 },
    ],
    tasks: [],
  };
}
