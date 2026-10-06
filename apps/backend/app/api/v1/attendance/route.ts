import { z } from "zod";
import type { Member } from "@/generated/prisma";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { attendanceAccess as access, canEditAttendance, deleteAttendanceRecord, getAttendance, saveAttendanceRecord } from "@/nut/lib/attendance";
import { successBody } from "@/nut/lib/errors";
import { dateString, parseBody, periodFrom } from "@/nut/lib/respond";

// 출석체크 기록. 보기는 NUT 회원 전원, 쓰기는 회장단·총무·admin만. 쓰기는 고친 반기의 출석 데이터를 돌려준다.

const record = z
  .object({
    periodId: z.string().optional(),
    date: dateString,
    name: z.string().trim().min(1, "이름을 입력하세요."),
    project: z.string().trim().nullish(),
    type: z.enum(["late", "absent", "quest"]),
    excuse: z.enum(["excused", "partial", "unexcused"]),
    minutesLate: z.number().int().min(0, "지각 시간은 0분 이상입니다.").nullable(),
    note: z.string().trim().nullish(),
  });

const reply = async (periodId: string | undefined, member: Member, requestId: string) =>
  successBody(await getAttendance(await periodFrom(periodId), canEditAttendance(member)), requestId);

export const GET = withApiHandler(
  async (req, { member, requestId }) => ({
    body: await reply(req.nextUrl.searchParams.get("period") ?? undefined, member, requestId),
  }),
  access,
);

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, record);
  await saveAttendanceRecord(body);
  return { body: await reply(body.periodId, member, requestId), status: 201 };
}, access);

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, record.extend({ id: z.string() }));
  await saveAttendanceRecord(body);
  return { body: await reply(body.periodId, member, requestId) };
}, access);

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = await parseBody(req, z.object({ id: z.string(), periodId: z.string().optional() }));
  await deleteAttendanceRecord(body.id);
  return { body: await reply(body.periodId, member, requestId) };
}, access);
