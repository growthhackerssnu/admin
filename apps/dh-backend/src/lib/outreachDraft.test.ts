import { describe, expect, it } from "vitest";
import {
  collaborationExamples,
  normalizeDraftGeneration,
  recipientLabels,
  renderOutreachTemplate,
  type PortfolioProject,
} from "./outreachDraft";

const projects: PortfolioProject[] = [
  {
    id: "past-1",
    companyName: "슈퍼센트",
    title: "광고 수익 최적화",
    summary: null,
  },
];

const input = {
  evidenceIds: new Set(["evidence-1"]),
  supportedAreas: [
    {
      area: "사용자·고객 분석",
      evidenceIds: ["evidence-1"],
      targetBusinessOutcome: "리텐션 개선",
    },
  ],
  pastProjects: projects,
};

function generated() {
  return {
    topic: "유저 리텐션 개선",
    motivation: "서비스 이용 흐름과 리텐션 과제를 확인",
    motivationEvidenceIds: ["evidence-1"],
    pastProjectIds: ["past-1"],
    projectIdeas: [
      {
        area: "사용자·고객 분석",
        title: "이탈 구간 분석",
        evidenceIds: ["evidence-1"],
      },
      {
        area: "사용자·고객 분석",
        title: "세그먼트별 리텐션 분석",
        evidenceIds: ["evidence-1"],
      },
      {
        area: "사용자·고객 분석",
        title: "개선 우선순위 도출",
        evidenceIds: ["evidence-1"],
      },
    ],
  };
}

describe("outreach draft generation", () => {
  it("keeps template wording fixed while rendering only supplied slots", () => {
    const rendered = renderOutreachTemplate(
      "안녕하세요, {{recipientGreeting}}. {{projectIdeas}}",
      {
        recipientGreeting: "예시 회사 김민수 Head님",
        projectIdeas: "- 이탈 구간 분석",
      },
    );
    expect(rendered).toBe(
      "안녕하세요, 예시 회사 김민수 Head님. - 이탈 구간 분석",
    );
  });

  it("uses a generic greeting for a company-owned mailbox", () => {
    expect(
      recipientLabels({
        companyName: "예시 회사",
        contactName: "예시 회사 담당자",
        contactTitle: null,
        ownerType: "company",
      }),
    ).toEqual({
      greeting: "예시 회사 담당자님",
      reference: "예시 회사 담당자님",
    });
  });

  it("accepts only supported fit areas and their evidence", () => {
    const normalized = normalizeDraftGeneration(generated(), input);
    expect(normalized.projectIdeas).toHaveLength(3);
    expect(collaborationExamples(projects, normalized.pastProjectIds)).toBe(
      "슈퍼센트 등 다양한",
    );

    expect(() =>
      normalizeDraftGeneration(
        {
          ...generated(),
          projectIdeas: generated().projectIdeas.map((idea) => ({
            ...idea,
            evidenceIds: ["unrelated"],
          })),
        },
        input,
      ),
    ).toThrow("적합 판정 근거");
  });
});
