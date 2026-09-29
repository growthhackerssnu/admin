import { withApiHandler } from "@/dh/lib/apiHandler";
import { successBody } from "@/dh/lib/errors";
import { searchOptions } from "@/dh/config/searchOptions";

// GET /search-options
export const GET = withApiHandler(async () => ({ body: successBody(searchOptions) }));
