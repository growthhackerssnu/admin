import { withListupApiHandler } from "@/lib/listup/apiHandler";
import { ApiError, fieldErrorsOf } from "@/lib/errors";
import { successBody } from "@/lib/listup/errors";
import { serializeEvidence } from "@/lib/listup/serializers";
import { prisma } from "@/lib/prisma";

// GET /evidence/{id} — 수집 근거 단건.
export const GET = withListupApiHandler<{ evidenceId: string }>(async (_req, { params }) => {
  const evidence = await prisma.evidence.findUnique({ where: { id: params.evidenceId } });
  if (!evidence) throw new ApiError("NOT_FOUND", "근거를 찾을 수 없습니다.");

  return { body: successBody(serializeEvidence(evidence)) };
});
