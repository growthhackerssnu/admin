import { withApiHandler } from "@/lib/apiHandler";
import { capabilitiesFor } from "@/lib/auth";
import { successBody } from "@/lib/errors";

// 학회원 계정 도메인이 섞여 있어(ghsnu.com/gmail.com/snu.ac.kr 등) 이메일
// 도메인으로 소속을 표현할 수 없다 — 어차피 이 조직은 하나뿐이라 고정값.
const ORGANIZATION_ID = "ghsnu";

// #01 GET /me
export const GET = withApiHandler(async (_req, { member, requestId }) => ({
  body: successBody(
    {
      userId: member.id,
      displayName: member.displayName,
      organizationId: ORGANIZATION_ID,
      capabilities: capabilitiesFor(member.role),
    },
    requestId,
  ),
}));
