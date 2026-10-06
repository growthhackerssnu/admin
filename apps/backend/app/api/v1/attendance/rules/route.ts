import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { attendanceAccess, getAttendance, saveRule, SETTING_KEYS } from "@/nut/lib/attendance";
import { ApiError, successBody } from "@/nut/lib/errors";
import { parseBody, periodFrom } from "@/nut/lib/respond";

// 출석체크 벌점·벌금 기준(반기별) 한 칸을 바꾼다. 그 반기의 기록 벌점이 바로 다시 계산된다.
export const PATCH = withApiHandler(async (req, { requestId }) => {
  const body = await parseBody(
    req,
    z.object({
      periodId: z.string().optional(),
      key: z.enum(SETTING_KEYS as [string, ...string[]]),
      value: z.number().int().min(0, "0 이상으로 입력하세요."),
    }),
  );
  if (body.key === "session-minutes" && body.value === 0) throw new ApiError("BAD_REQUEST", "세션 길이는 1분 이상입니다.");
  const periodId = await periodFrom(body.periodId);
  await saveRule(periodId, body.key, body.value);
  return { body: successBody(await getAttendance(periodId), requestId) };
}, attendanceAccess);
