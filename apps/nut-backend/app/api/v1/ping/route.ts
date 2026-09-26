import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";

export const GET = withApiHandler(async (_req, { member, requestId }) => ({
  body: successBody({ ok: true, app: "nut", member: { id: member.id, displayName: member.displayName, role: member.role } }, requestId),
}));
