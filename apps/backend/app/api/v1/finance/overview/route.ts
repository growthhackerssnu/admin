import { withApiHandler } from "@/nut/lib/apiHandler";
import { successBody } from "@/nut/lib/errors";
import { getFinanceOverview } from "@/nut/lib/financeRepository";

export const GET = withApiHandler(async (_req, { requestId }) => ({
  body: successBody(await getFinanceOverview(), requestId),
}));
