import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { EditRequestInput, submitEditRequest } from "@/hr/lib/editRequests";

// POST /api/v1/edit-requests — 프로필 상세(/hr/people/:id) 수정 제출(ARCHITECTURE.md
// §12.3). 이미 대기 중인 요청이 있으면 새로 만들지 않고 덮어쓴다(§12.3.1) —
// 그래서 멱등성 키가 따로 없어도 같은 내용을 두 번 눌러도 안전하다.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = await req.json().catch(() => null);
  const parsed = EditRequestInput.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([key, messages]) => [
        key,
        messages?.[0] ?? "입력값을 확인하세요.",
      ]),
    );
    throw new ApiError("VALIDATION_ERROR", "입력값을 확인하세요.", { fieldErrors });
  }

  const editRequest = await submitEditRequest(member, parsed.data);
  return { status: 201, body: successBody(editRequest, requestId) };
});
