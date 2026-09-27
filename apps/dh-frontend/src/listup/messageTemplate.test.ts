import { describe, expect, it } from "vitest";
import { sampleCompanies } from "./fixtures";
import {
  contactMessage,
  projectSchedule,
  changeMessageQuarter,
  withCompanyParticle,
} from "./messageTemplate";
import { prepareCandidateTasks, resolvedBody } from "./model";
import { initialState } from "./fixtures";

describe("공통 컨택 메시지 템플릿", () => {
  it("목표 분기 일정과 연도 경계를 계산한다", () => {
    expect(projectSchedule("2027-Q1")).toEqual({
      period: "2027년 1~3월",
      kickoff: "2026년 12월 4주차~5주차",
      interim: "2027년 2월 1~2주차",
      final: "2027년 3월 3~4주차",
      next: "2027년 4~5월",
    });
    expect(projectSchedule("2026-Q4").next).toBe("2027년 1~2월");
    expect(projectSchedule("2026-Q2").kickoff).toBe("2026년 3월 4주차~5주차");
    expect(() => projectSchedule("2027-Q5")).toThrow();
  });

  it("발신자는 대외협력팀장 직급으로 찾고 소개와 서명에 같은 이름을 넣는다", () => {
    const draft = contactMessage(sampleCompanies[0], "2026-Q4", [
      { name: "다른 팀장", jobTitle: "학회장" },
      { name: "새 팀장", jobTitle: "대외협력팀장" },
    ]);
    expect(draft.body.match(/대외협력팀장 새 팀장/g)).toHaveLength(2);
    expect(draft.body).not.toContain("여재욱");
    expect(draft.body).toContain("2026년 10~12월");
    expect(draft.body).toContain("1. 더브이씨:");
    expect(draft.body).toContain("4. 원셀프월드:");
    expect(draft.body).toContain("010-4757-3987");
    expect(contactMessage(sampleCompanies[0], "2026-Q4", []).body).toContain(
      "{{대외협력팀장명}}",
    );
  });

  it("두 채널에서 동일한 본문에 수신자 이름과 직함을 반영한다", () => {
    const company = sampleCompanies[0];
    const task = prepareCandidateTasks(initialState()).tasks.find(
      (item) => item.companyId === company.id,
    )!;
    const draft = contactMessage(company, task.quarter, [
      { name: "여재욱", jobTitle: "대외협력팀장" },
    ]);
    const selected = { ...task, ...draft, personId: company.people[0].id };
    const email = resolvedBody({ ...selected, channel: "email" }, company);
    expect(email).toBe(
      resolvedBody({ ...selected, channel: "linkedin" }, company),
    );
    expect(email).toContain("모닝루프 김서연 Product Manager 님");
    expect(email).not.toContain("{{수신자");
    expect(withCompanyParticle("모닝루프")).toBe("모닝루프와");
    expect(withCompanyParticle("폴드마켓")).toBe("폴드마켓과");
  });

  it("분기를 바꾸어도 수정한 제안 문구는 유지하고 일정만 교체한다", () => {
    const before =
      contactMessage(sampleCompanies[0], "2026-Q4", []).body +
      "\n직접 수정한 제안";
    const after = changeMessageQuarter(before, "2026-Q4", "2027-Q1");
    expect(after).toContain("2027년 1~3월");
    expect(after).toContain("2026년 12월 4주차~5주차");
    expect(after).toContain("2027년 4~5월");
    expect(after).not.toContain("2026년 10~12월");
    expect(after).toContain("직접 수정한 제안");
  });
});
