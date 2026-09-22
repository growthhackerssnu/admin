import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { searchOptions } from "@/config/searchOptions";

// #03 GET /search-options
export const GET = withApiHandler(async (_req, { requestId }) => ({
  body: successBody(searchOptions, requestId),
}));
