import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_ORIGINS } from "@/lib/origins";

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  // Idempotency-Key는 우리 쓰기 API가 쓰는 커스텀 헤더라 기본 허용 목록엔 없다.
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

// 프리플라이트(OPTIONS)는 라우트 핸들러까지 안 가고 여기서 바로 응답한다.
// 실제 요청은 next()로 통과시키되 같은 헤더를 응답에 얹는다.
export function middleware(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  headers.forEach((value, key) => res.headers.set(key, value));
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
