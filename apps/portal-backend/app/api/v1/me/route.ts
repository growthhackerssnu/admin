import { withApiHandler } from "@/lib/apiHandler";
import { redirectPathFor } from "@/lib/auth";
import { successBody } from "@/lib/errors";

// #01 GET /me — 로그인 직후 프론트가 "이 사람이 누구고 어디로 보내야 하는지"
// 판단하는 유일한 근거. redirectPath는 role 기반 고정 매핑(admin->/admin,
// acting->/dh, alumni->/hr)이라 여기서 같이 내려준다 — 프론트가 role별
// 분기 로직을 따로 들고 있을 필요가 없게.
export const GET = withApiHandler(async (_req, { member, requestId }) => ({
  body: successBody(
    {
      userId: member.id,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      redirectPath: redirectPathFor(member.role),
    },
    requestId,
  ),
}));
