import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedMember } from "./auth";
import { ApiError, errorBody } from "./errors";

export function withApiHandler(handler: (req: NextRequest, context: { member: Awaited<ReturnType<typeof getAuthenticatedMember>>; requestId: string }) => Promise<{ body: unknown; status?: number }>) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    try {
      const member = await getAuthenticatedMember(req);
      const result = await handler(req, { member, requestId });
      return NextResponse.json(result.body, { status: result.status ?? 200 });
    } catch (error) {
      if (error instanceof ApiError) return NextResponse.json(errorBody(error, requestId), { status: error.status });
      console.error(`[${requestId}]`, error);
      const fallback = new ApiError("INTERNAL_ERROR", "예기치 못한 오류가 발생했습니다.");
      return NextResponse.json(errorBody(fallback, requestId), { status: 500 });
    }
  };
}
