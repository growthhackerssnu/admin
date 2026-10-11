import { z } from "zod";
import { withApiHandler } from "@/portal/lib/apiHandler";
import { ApiError, successBody } from "@/portal/lib/errors";
import { ALLOWED_ORIGINS } from "@/lib/origins";
import { isAllowedRedirect } from "@/slackExport/proxy";
import { requireSlackBackup } from "@/slackExport/access";

// 슬랙 백업: "슬랙으로 로그인"의 code를 사용자 토큰(xoxp-)으로 바꿔 돌려준다. 토큰은 저장·기록하지 않는다.
// admin·acting과 19기 이후 알럼나이만(requireSlackBackup).
const body = z.object({ code: z.string().min(1), redirectUri: z.string().min(1) });

export const POST = withApiHandler(async (req, { member, requestId }) => {
  await requireSlackBackup(member);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "code와 redirectUri가 필요합니다.");
  const { code, redirectUri } = parsed.data;
  if (!isAllowedRedirect(redirectUri, ALLOWED_ORIGINS)) throw new ApiError("VALIDATION_ERROR", "허용되지 않은 redirect 주소입니다.");
  const clientId = process.env.SLACK_EXPORT_CLIENT_ID;
  const clientSecret = process.env.SLACK_EXPORT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ApiError("INTERNAL_ERROR", "슬랙 백업 앱이 설정되지 않았습니다.");

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    body: new URLSearchParams({ code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json()) as {
    ok: boolean;
    error?: string;
    team?: { id: string; name: string };
    authed_user?: { id: string; access_token?: string };
  };
  if (!result.ok || !result.authed_user?.access_token) {
    throw new ApiError("VALIDATION_ERROR", `슬랙 로그인에 실패했습니다(${result.error ?? "no user token"}). 다시 시도하세요.`);
  }
  return {
    body: successBody(
      { token: result.authed_user.access_token, userId: result.authed_user.id, teamId: result.team?.id, teamName: result.team?.name },
      requestId,
    ),
  };
});
