import { NextResponse, type NextRequest } from "next/server";
import type { Member } from "@/generated/prisma";
import { getAuthenticatedMember } from "../auth";
import { ApiError } from "../errors";
import { errorBody } from "./errors";

export type ListupApiContext<P = Record<string, string>> = {
  member: Member;
  requestId: string;
  params: P;
};

type RouteResult = { status?: number; body: unknown; headers?: Record<string, string> };
type RouteHandler<P> = (req: NextRequest, ctx: ListupApiContext<P>) => Promise<RouteResult>;

// 리스트업 신규 경로 전용 래퍼. 기존 발송 경로는 src/lib/apiHandler.ts를 쓴다.
//
// 차이는 두 가지뿐이다:
//   1. 성공 응답에 requestId를 붙이지 않는다 — 리스트업 봉투는 오류에만 싣는다.
//   2. 오류를 리스트업 봉투(details)로 렌더링한다.
//
// 인증은 같은 getAuthenticatedMember를 쓴다. 인증 계층까지 두 벌로 만들 이유는 없다.
export function withListupApiHandler<P = Record<string, string>>(handler: RouteHandler<P>) {
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
