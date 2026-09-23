import { NextResponse, type NextRequest } from "next/server";

// 로컬 프론트(5174)와 운영 admin.ghsnu.com만 허용한다. 필요해지면
// ALLOWED_ORIGINS(콤마 구분)로 배포 프리뷰 URL 등을 추가할 수 있다.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5174,https://admin.ghsnu.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

// 프리플라이트(OPTIONS)는 라우트 핸들러까지 안 가고 여기서 바로 응답한다.
// 실제 요청은 next()로 통과시키되 같은 헤더를 응답에 얹는다.
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

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
