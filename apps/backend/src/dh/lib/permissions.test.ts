import { describe, expect, it } from "vitest";
import type { Member } from "@/generated/prisma";
import type { ApiError } from "./errors";
import { assertCanModify, canModify, isTeamLead } from "./permissions";

const member = (id: string, role: Member["role"]) => ({ id, role }) as Member;

const teamMember = member("m1", "acting");
const otherMember = member("m2", "acting");
const teamLead = member("lead", "admin");

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return (err as ApiError).code;
  }
  return "NO_ERROR";
}

describe("P-23 담당자 기반 권한", () => {
  it("팀원은 본인 담당만 변경한다", () => {
    expect(canModify(teamMember, "m1")).toBe(true);
    expect(canModify(teamMember, "m2")).toBe(false);
  });

  it("팀장은 타인 업무도 변경한다", () => {
    expect(canModify(teamLead, "m1")).toBe(true);
    expect(canModify(teamLead, "m2")).toBe(true);
  });

  it("담당자를 모르는 과거 행은 팀장만 변경한다 — 소유권을 추정하지 않는다", () => {
    expect(canModify(teamMember, null)).toBe(false);
    expect(canModify(teamLead, null)).toBe(true);
  });

  it("권한이 없으면 403 FORBIDDEN이고, 조회가 막힌다는 뜻은 아니다", () => {
    expect(codeOf(() => assertCanModify(teamMember, otherMember.id))).toBe("FORBIDDEN");
    expect(codeOf(() => assertCanModify(teamMember, teamMember.id))).toBe("NO_ERROR");
  });

  it("팀장 판정은 역할에서만 나온다 — 요청 본문으로 얻을 수 없다", () => {
    expect(isTeamLead(teamLead)).toBe(true);
    expect(isTeamLead(teamMember)).toBe(false);
  });
});
