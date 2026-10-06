import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { attendanceAccess, canEditAttendance, clearPenalties, getAttendance, undoLastClear } from "@/nut/lib/attendance";
import { successBody } from "@/nut/lib/errors";
import { dateString, parseBody, periodFrom } from "@/nut/lib/respond";

// 벌점 초기화(분기마다): POST로 그 날짜까지 초기화, DELETE로 가장 최근 초기화를 되돌린다.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ periodId: z.string().optional(), through: dateString }));
  await clearPenalties(body.through);
  return { body: successBody(await getAttendance(await periodFrom(body.periodId), canEditAttendance(member)), requestId), status: 201 };
}, attendanceAccess);

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ periodId: z.string().optional() }));
  await undoLastClear();
  return { body: successBody(await getAttendance(await periodFrom(body.periodId), canEditAttendance(member)), requestId) };
}, attendanceAccess);
