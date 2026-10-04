import { z } from "zod";
import { withApiHandler } from "@/nut/lib/apiHandler";
import { ApiError } from "@/nut/lib/errors";
import { createPeriod } from "@/nut/lib/financeRepository";
import { canManageClaims, dateString, overviewBody, parseBody } from "@/nut/lib/respond";

// 새 반기 시작. 이전 반기의 예산 구조·변수·운영팀을 복사한다. 총무·회장단만.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  if (!canManageClaims(member)) throw new ApiError("FORBIDDEN", "새 반기는 총무·회장단만 만들 수 있습니다.");
  const body = await parseBody(
    req,
    z
      .object({
        id: z.string().regex(/^\d{4}-[12]h$/, "반기 id는 2027-1h 형식이어야 합니다."),
        label: z.string().trim().min(1, "이름을 입력하세요."),
        start: dateString,
        end: dateString,
        copyFromId: z.string().min(1),
      })
      .refine((value) => value.start < value.end, "끝나는 날이 시작일보다 뒤여야 합니다."),
  );
  return { body: await overviewBody(await createPeriod(body), member, requestId), status: 201 };
});
