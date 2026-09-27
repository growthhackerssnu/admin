import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { getFinanceOverview } from "@/lib/financeRepository";

export const GET = withApiHandler(async (_req, { requestId }) => ({
  body: successBody(await getFinanceOverview(), requestId),
}));
