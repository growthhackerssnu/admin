import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { searchOptions } from "@/config/searchOptions";

// GET /search-options
export const GET = withApiHandler(async () => ({ body: successBody(searchOptions) }));
