import { withApiHandler } from "@/nut/lib/apiHandler";
import { overviewBody, periodFrom } from "@/nut/lib/respond";

// ?period=2026-2h. 없으면 오늘이 속한 반기.
export const GET = withApiHandler(async (req, { member, requestId }) => ({
  body: await overviewBody(await periodFrom(req.nextUrl.searchParams.get("period")), member, requestId),
}));
