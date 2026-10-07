import { describe, expect, it, vi } from "vitest";
import type { OpsRole } from "@/generated/prisma";
import { hasOpsRole, OFFICE_ROLES, opsRoleTitle, sortOpsRoles, TEAM_ROLES } from "./opsRoles";
import { bulkRoleChangeSchema } from "./validation/admin";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { canReviewEditRequests } = await import("@/hr/lib/auth");

const member = (role: "admin" | "acting" | "alumni", ...opsRoles: OpsRole[]) =>
  ({ role, opsRoles: opsRoles.map((opsRole) => ({ opsRole })) }) as unknown as Parameters<typeof canReviewEditRequests>[0];

describe("운영팀 직책", () => {
  it("나눈다: 직책(임원·팀장)과 팀원", () => {
    expect(OFFICE_ROLES).toEqual(["president", "vice_president", "treasurer", "external_lead", "hr_lead", "pr_lead", "edu_lead"]);
    expect(TEAM_ROLES).toEqual(["external_member", "hr_member", "pr_member", "edu_member"]);
  });

  it("finds a role among several (총무이면서 대외협력·에듀 팀원)", () => {
    const m = member("acting", "treasurer", "external_member", "edu_member");
    expect(hasOpsRole(m, "treasurer")).toBe(true);
    expect(hasOpsRole(m, "external_lead", "external_member")).toBe(true);
    expect(hasOpsRole(m, "president")).toBe(false);
  });

  it("titles an office with its 기수 and sorts offices before teams", () => {
    expect(opsRoleTitle({ opsRole: "president", cohort: 20 })).toBe("20기 회장");
    expect(opsRoleTitle({ opsRole: "pr_member", cohort: null })).toBe("PR 팀원");
    expect(sortOpsRoles([{ opsRole: "pr_member" }, { opsRole: "president" }]).map((r) => r.opsRole)).toEqual([
      "president",
      "pr_member",
    ]);
  });
});

describe("승인 큐 권한", () => {
  it("lets admin and every PR team member review", () => {
    expect(canReviewEditRequests(member("admin"))).toBe(true);
    expect(canReviewEditRequests(member("acting", "pr_lead"))).toBe(true);
    expect(canReviewEditRequests(member("acting", "president", "pr_member"))).toBe(true);
  });

  it("keeps everyone else out", () => {
    expect(canReviewEditRequests(member("acting", "hr_lead", "external_member"))).toBe(false);
    expect(canReviewEditRequests(member("alumni"))).toBe(false);
  });
});

describe("PATCH /admin/members/role 입력", () => {
  it("accepts one office plus several teams", () => {
    const parsed = bulkRoleChangeSchema.safeParse({
      memberIds: ["m1"],
      role: "acting",
      office: "treasurer",
      teams: ["external_member", "edu_member"],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a team-only change that keeps everyone's office (office omitted)", () => {
    const parsed = bulkRoleChangeSchema.safeParse({ memberIds: ["m1", "m2"], role: "acting", teams: ["pr_member"] });
    expect(parsed.success && parsed.data.role === "acting" && parsed.data.office).toBeUndefined();
  });

  it("rejects a team given as the office, an office given as a team, and duplicate teams", () => {
    const base = { memberIds: ["m1"], role: "acting", teams: [] };
    expect(bulkRoleChangeSchema.safeParse({ ...base, office: "pr_member" }).success).toBe(false);
    expect(bulkRoleChangeSchema.safeParse({ ...base, teams: ["president"] }).success).toBe(false);
    expect(bulkRoleChangeSchema.safeParse({ ...base, teams: ["pr_member", "pr_member"] }).success).toBe(false);
  });
});
