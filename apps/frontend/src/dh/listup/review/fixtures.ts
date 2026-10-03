import type { Candidate, Research, ReviewData } from "./contracts";
import { currentActor } from "./contracts";

const at = "2026-09-30T00:00:00.000Z";
function research(
  id: string,
  name: string,
  product: string,
  customer: string,
): Research {
  return {
    id: `${id}-research-1`,
    at,
    facts: [
      { title: "제품과 서비스", text: product, evidenceId: "product" },
      { title: "주요 고객", text: customer, evidenceId: "customer" },
      {
        title: "사용 흐름",
        text: "가입 후 기능을 탐색하고, 반복 사용을 통해 서비스의 가치를 경험하는 구조입니다.",
        evidenceId: "product",
      },
    ],
    ideas: [
      {
        title: "첫 사용에서 반복 사용으로 이어지는 경험",
        rationale:
          "주요 기능의 이용 흐름을 살펴보고 첫 사용 이후 이탈 구간을 분석하는 과제를 제안할 수 있습니다.",
        evidenceIds: ["product"],
      },
      {
        title: "고객군별 이용 목적과 패턴",
        rationale:
          "주요 고객군의 이용 목적을 구분하고 세그먼트별 서비스 활용 전략을 함께 검토할 수 있습니다.",
        evidenceIds: ["customer"],
      },
      {
        title: "다음 행동에 대한 예측 가능성",
        rationale:
          "사용 이력이 충분히 쌓여 있다면 다음 행동 예측 모델의 활용 가능성을 논의할 수 있습니다.",
        evidenceIds: ["product"],
      },
    ],
    evidence: [
      {
        id: "product",
        title: `${name} 제품 소개 · 시연 자료`,
        excerpt: product,
        url: "https://example.com/product",
      },
      {
        id: "customer",
        title: `${name} 고객 소개 · 시연 자료`,
        excerpt: customer,
        url: "https://example.com/customers",
      },
    ],
    unknowns: [
      "고객 행동 데이터의 실제 보유 범위와 제공 가능 여부",
      "기업 내부의 우선 과제와 프로젝트 담당자의 가용 시간",
    ],
  };
}
function company(
  id: string,
  name: string,
  summary: string,
  customer: string,
): Candidate {
  return {
    id,
    name,
    summary,
    website: "https://example.com",
    discoveredAt: at,
    source: "웹 아카이브 · 시연",
    sourceUrl: "https://startuprecipe.co.kr/archives/invest-newsletter",
    researchStatus: "ready",
    research: research(id, name, summary, customer),
    error: null,
    owner: null,
    reviewStatus: "unreviewed",
    decisions: [],
    recipient: null,
    quarter: null,
    draft: null,
    sent: [],
    version: 1,
  };
}
export function initialReviewData(): ReviewData {
  const companies = [
    company(
      "morningloop",
      "모닝루프",
      "팀의 반복 업무를 정리하고 자동화하는 B2B 협업 서비스",
      "소규모 조직의 운영팀과 프로젝트 담당자",
    ),
    company(
      "clearnote",
      "클리어노트",
      "회의 기록을 팀의 지식으로 연결하는 문서 서비스",
      "회의와 문서 작업이 잦은 지식 근로자",
    ),
    company(
      "foldmarket",
      "폴드마켓",
      "생활용품 브랜드와 고객을 연결하는 커머스 플랫폼",
      "생활용품 브랜드와 온라인 소비자",
    ),
    company(
      "greentable",
      "그린테이블",
      "개인별 식습관에 맞춰 식단을 제안하는 서비스",
      "개인 맞춤 식단을 원하는 소비자",
    ),
    company(
      "localpass",
      "로컬패스",
      "지역의 경험과 공간을 발견하는 예약 플랫폼",
      "지역 방문객과 공간 운영자",
    ),
    company(
      "worknest",
      "워크네스트",
      "작은 팀을 위한 업무 공간 운영 도구",
      "공유 공간 운영자와 입주 팀",
    ),
  ];
  companies[2].researchStatus = "error";
  companies[2].research = null;
  companies[2].error = {
    message:
      "기업 홈페이지 응답 시간이 초과되었습니다. 저장된 후보는 유지됩니다.",
    retryable: true,
  };
  companies[3].researchStatus = "running";
  companies[3].research = null;
  companies[0].owner = currentActor;
  companies[1].owner = currentActor;
  companies[4].owner = { id: "preview-b", name: "샘플 팀원 B" };
  companies[4].reviewStatus = "reviewing";
  companies[5].owner = currentActor;
  companies[5].reviewStatus = "rejected_contact";
  companies[5].decisions = [
    {
      status: "rejected_contact",
      fit: "fit",
      contact: "not_found",
      actor: currentActor,
      at,
      researchId: companies[5].research!.id,
      note: "협업 접점은 있지만 연락할 관계자를 아직 찾지 못했습니다.",
    },
  ];
  return {
    schema: 1,
    currentRound: { id: "preview-round", targetQuarter: { id: "preview-quarter", year: 2027, quarter: 1 }, startedAt: at, endedAt: null },
    actor: currentActor,
    candidates: companies,
    quarters: ["2026-Q4", "2027-Q1"],
    runs: [
      {
        id: "run-1",
        at,
        source: "웹 아카이브",
        status: "completed",
        items: [
          {
            id: "article-1",
            title: "주간 기업 소식 · 시연 원문",
            url: "https://startuprecipe.co.kr/archives/invest-newsletter",
            names: companies.map((c) => c.name),
            duplicates: 2,
            error: null,
          },
        ],
      },
    ],
  };
}
