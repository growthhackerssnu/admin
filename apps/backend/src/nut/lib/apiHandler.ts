import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedMember } from "./auth";
import { Prisma } from "@/generated/prisma";
import { ApiError, errorBody } from "./errors";
import { ClaimStateError, ParameterInUseError } from "./financeRepository";

export function withApiHandler(handler: (req: NextRequest, context: { member: Awaited<ReturnType<typeof getAuthenticatedMember>>; requestId: string }) => Promise<{ body: unknown; status?: number }>) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    try {
      const member = await getAuthenticatedMember(req);
      const result = await handler(req, { member, requestId });
      return NextResponse.json(result.body, { status: result.status ?? 200 });
    } catch (error) {
      if (error instanceof ApiError) return NextResponse.json(errorBody(error, requestId), { status: error.status });
      // 업무 규칙 위반은 화면에 그대로 보여줄 메시지라 400으로 돌려준다.
      const known =
        error instanceof ClaimStateError || error instanceof ParameterInUseError
          ? new ApiError("BAD_REQUEST", error.message)
          : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025"
            ? new ApiError("NOT_FOUND", "대상을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.")
            : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
              ? new ApiError("BAD_REQUEST", "같은 이름이 이미 있습니다.")
              : null;
      if (known) return NextResponse.json(errorBody(known, requestId), { status: known.status });
      console.error(`[${requestId}]`, error);
      const fallback = new ApiError("INTERNAL_ERROR", "예기치 못한 오류가 발생했습니다.");
      return NextResponse.json(errorBody(fallback, requestId), { status: 500 });
    }
  };
}
