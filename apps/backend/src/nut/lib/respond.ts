import { z } from "zod";
import type { Member } from "@/generated/prisma";
import { ApiError, successBody } from "./errors";
import { getFinanceOverview, resolvePeriodId } from "./financeRepository";

// 청구서 승인·반려·지급과 계좌번호 열람은 admin과 총무·회장단만.
export function canManageClaims(member: Member) {
  return (
    member.role === "admin" ||
    member.opsRole === "treasurer" ||
    member.opsRole === "president" ||
    member.opsRole === "vice_president"
  );
}

// 모든 NUT 쓰기 API는 바뀐 반기의 전체 화면 데이터를 돌려준다(화면이 그대로 갈아끼운다).
export async function overviewBody(periodId: string, member: Member, requestId: string) {
  const overview = await getFinanceOverview(periodId, {
    memberId: member.id,
    canManageClaims: canManageClaims(member),
  });
  return successBody(overview, requestId);
}

export async function periodFrom(value: unknown) {
  return resolvePeriodId(typeof value === "string" && value ? value : null);
}

// JSON 본문을 zod로 검증한다. 첫 오류 메시지를 그대로 화면에 보여준다.
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(await req.json().catch(() => null));
  if (!result.success) throw new ApiError("BAD_REQUEST", result.error.issues[0]?.message ?? "입력값을 확인하세요.");
  return result.data;
}

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 YYYY-MM-DD로 입력하세요.");
