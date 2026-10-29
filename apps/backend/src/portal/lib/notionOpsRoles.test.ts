import { describe, expect, it } from "vitest";
import { opsRolesFromNotion, opsRolesToNotion, sameOpsRoles } from "./notionOpsRoles";

describe("노션 직책·소속팀 ↔ 운영팀 직책", () => {
  it("노션 값을 옮긴다(짝 없는 NUT는 무시)", () => {
    expect(opsRolesFromNotion("총무 / 내부운영팀장", ["NUT", "EDU", "DH"])).toEqual([
      "treasurer",
      "external_member",
      "edu_member",
    ]);
    expect(opsRolesFromNotion(null, [])).toEqual([]);
  });

  it("팀장의 자기 팀은 노션 소속팀에만 둔다", () => {
    expect(opsRolesFromNotion("교육팀장", ["HR", "EDU"])).toEqual(["edu_lead", "hr_member"]);
    expect(opsRolesToNotion(["edu_lead", "hr_member"], [])).toEqual({ position: "교육팀장", teams: ["HR", "EDU"] });
    expect(sameOpsRoles(["hr_lead", "hr_member"], ["hr_lead"])).toBe(true);
  });

  it("노션으로 쓸 때 짝 없는 소속팀은 남긴다", () => {
    expect(opsRolesToNotion(["hr_lead"], ["NUT", "PR"])).toEqual({ position: "HR팀장", teams: ["NUT", "HR"] });
    expect(opsRolesToNotion([], ["DH"])).toEqual({ position: null, teams: [] });
  });

  it("왕복하면 그대로다", () => {
    const roles = opsRolesFromNotion("교육팀장", ["EDU", "PR"]);
    const back = opsRolesToNotion(roles, []);
    expect(opsRolesFromNotion(back.position, back.teams)).toEqual(roles);
  });

  it("순서와 무관하게 비교한다", () => {
    expect(sameOpsRoles(["pr_member", "president"], ["president", "pr_member"])).toBe(true);
    expect(sameOpsRoles(["pr_member"], ["pr_member", "hr_member"])).toBe(false);
  });
});
