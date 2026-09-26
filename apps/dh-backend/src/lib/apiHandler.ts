import { NextResponse, type NextRequest } from "next/server";
import type { Member } from "@/generated/prisma";
import { getAuthenticatedMember } from "./auth";
import { ApiError, errorBody } from "./errors";

export type ApiContext<P = Record<string, string>> = {
  member: Member;
  requestId: string;
  params: P;
};

// headers는 202 응답의 Location처럼 봉투 밖에 실어야 하는 값에 쓴다 (명세 §6.1, §6.6).
type RouteResult = { status?: number; body: unknown; headers?: Record<string, string> };
type RouteHandler<P> = (req: NextRequest, ctx: ApiContext<P>) => Promise<RouteResult>;

// 모든 app/api/v1/**/route.ts가 이 래퍼로 감싼다:
// - requestId 생성
// - 인증(모든 업무 요청은 인증된 멤버 범위)
// - ApiError -> 표준 에러 봉투 변환, 그 외 예외는 INTERNAL_ERROR로 흡수
export function withApiHandler<P = Record<string, string>>(handler: RouteHandler<P>) {
  return async (req: NextRequest, routeCtx: { params: P }) => {
    const requestId = crypto.randomUUID();
    try {
      const member = await getAuthenticatedMember(req);
      const result = await handler(req, { member, requestId, params: routeCtx.params });
      return NextResponse.json(result.body, {
        status: result.status ?? 200,
        ...(result.headers ? { headers: result.headers } : {}),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(errorBody(err, requestId), { status: err.status });
      }
      console.error(`[${requestId}]`, err);
      const fallback = new ApiError("INTERNAL_ERROR", "예기치 못한 오류가 발생했습니다.");
      return NextResponse.json(errorBody(fallback, requestId), { status: fallback.status });
    }
  };
}
