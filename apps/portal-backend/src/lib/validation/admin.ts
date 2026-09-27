import { z } from "zod";
import { OPS_ROLES } from "../opsRoles";

const memberIds = z.array(z.string().min(1)).min(1, "최소 한 명은 선택해야 합니다.");

// admin으로의 승격/강등은 이 API로 하지 않는다 — 수동(CLI/직접 DB)으로만.
//
// role과 운영팀 직책(opsRole)은 항상 같이 움직인다. acting에게는 직책이 반드시
// 있어야 하고 alumni에게는 있을 수 없어서, 두 갈래를 각각 다른 모양으로 받는다
// (opsRole을 optional 하나로 두면 "acting인데 직책 없음"이 스키마를 통과한다).
// "그 직책을 이미 다른 사람이 갖고 있는지" 같은 사람 관련 규칙은 라우트에서
// 검사한다 — 누가 갖고 있는지 알려주려면 DB를 봐야 한다.
export const bulkRoleChangeSchema = z.discriminatedUnion("role", [
  z.object({
    memberIds,
    role: z.literal("acting"),
    opsRole: z.enum(OPS_ROLES, {
      required_error: "acting으로 두려면 운영팀 직책을 지정해야 합니다.",
      invalid_type_error: "운영팀 직책 값이 올바르지 않습니다.",
    }),
  }),
  z.object({
    memberIds,
    role: z.literal("alumni"),
    // alumni가 되면 운영팀 직책은 사라진다 — 보내려 했다면 오해한 것이니 알려준다.
    opsRole: z
      .null({ invalid_type_error: "alumni에게는 운영팀 직책을 줄 수 없습니다." })
      .optional(),
  }),
]);

export const bulkDeactivateSchema = z.object({
  memberIds,
});
