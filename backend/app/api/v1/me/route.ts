import { withApiHandler } from "@/lib/apiHandler";
import { capabilitiesFor } from "@/lib/auth";
import { successBody } from "@/lib/errors";

// #01 GET /me
export const GET = withApiHandler(async (_req, { member, requestId }) => ({
  body: successBody(
    {
      userId: member.id,
      displayName: member.displayName,
      organizationId: process.env.ALLOWED_EMAIL_DOMAIN ?? null,
      capabilities: capabilitiesFor(member.role),
    },
    requestId,
  ),
}));
