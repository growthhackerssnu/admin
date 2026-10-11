import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedMember } from "@/nut/lib/auth";
import { ApiError, errorBody } from "@/nut/lib/errors";
import { parseBody } from "@/nut/lib/respond";
import { fetchSlackFile, isAllowedFileUrl } from "@/slackExport/proxy";

// 슬랙 백업: files.slack.com은 CORS가 없어서 첨부 파일·아바타·이모지를 여기서 받아 그대로 흘려준다.
// 사용자 토큰은 본문으로 받아 슬랙에만 전달하고 저장·기록하지 않는다. 응답이 파일이라 withApiHandler 대신 직접 인증한다.
const body = z.object({ url: z.string(), token: z.string().min(1) });

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    await getAuthenticatedMember(req);
    const { url, token } = await parseBody(req, body);
    if (!isAllowedFileUrl(url)) throw new ApiError("BAD_REQUEST", "슬랙 파일 주소가 아닙니다.");
    const upstream = await fetchSlackFile(url, token);
    const type = upstream.headers.get("content-type") ?? "application/octet-stream";
    // 권한이 없으면 슬랙은 파일 대신 로그인 HTML 페이지를 200으로 준다.
    if (!upstream.ok || (new URL(url).hostname === "files.slack.com" && type.startsWith("text/html"))) {
      return NextResponse.json(errorBody(new ApiError("NOT_FOUND", "파일을 받을 수 없습니다."), requestId), { status: 404 });
    }
    return new Response(upstream.body, { headers: { "Content-Type": type } });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json(errorBody(error, requestId), { status: error.status });
    console.error(`[${requestId}] slack file proxy`, error instanceof Error ? error.message : error);
    return NextResponse.json(errorBody(new ApiError("INTERNAL_ERROR", "파일을 받지 못했습니다."), requestId), { status: 502 });
  }
}
