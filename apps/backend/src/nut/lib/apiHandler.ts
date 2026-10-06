import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedMember } from "./auth";
import { Prisma } from "@/generated/prisma";
import { ApiError, errorBody } from "./errors";
import { ClaimStateError, ParameterInUseError } from "./financeRepository";
import { canEditFinance } from "./respond";

type AuthedMember = Awaited<ReturnType<typeof getAuthenticatedMember>>;

// 기본: 보기(GET)는 NUT 회원 전원, 그 밖의 모든 요청은 admin·총무만. 권한은 여기 한 곳에서만 판단한다.
// 출석체크처럼 보기부터 막아야 하는 라우트는 access로 덮어쓴다.
const financeAccess = {
  allow: (member: AuthedMember, method: string) => method === "GET" || canEditFinance(member),
  message: "NUT 수정은 총무와 관리자만 할 수 있습니다.",
};

export function withApiHandler(
  handler: (req: NextRequest, context: { member: AuthedMember; requestId: string }) => Promise<{ body: unknown; status?: number }>,
  access = financeAccess,
) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    try {
      const member = await getAuthenticatedMember(req);
      if (!access.allow(member, req.method)) throw new ApiError("FORBIDDEN", access.message);
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
