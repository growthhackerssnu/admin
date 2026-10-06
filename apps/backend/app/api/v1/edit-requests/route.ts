import { withApiHandler } from "@/hr/lib/apiHandler";
import { ApiError, successBody } from "@/hr/lib/errors";
import { EditRequestInput, submitEditRequest } from "@/hr/lib/editRequests";
import { prisma } from "@/lib/prisma";

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
  await notifySlack(member.id, editRequest.diff);
  return { status: 201, body: successBody(editRequest, requestId) };
});

// 새 수정 요청을 Slack 채널에 알린다(Incoming Webhook). URL이 없으면 건너뛰고,
// Slack이 실패해도 제출 자체는 성공으로 둔다.
const SECTION_LABELS: Record<string, string> = { careers: "커리어", activities: "활동", projects: "프로젝트" };

async function notifySlack(memberId: string, diff: unknown) {
  const url = process.env.SLACK_EDIT_REQUEST_WEBHOOK_URL;
  if (!url) return;
  // 승인 큐와 같은 이름·기수(core.people_directory)를 쓴다.
  const requester = await prisma.member.findUnique({ where: { id: memberId }, include: { claimedPersonEntry: true } });
  const person = requester?.claimedPersonEntry;
  const name = `${person?.cohort != null ? `${person.cohort}기 ` : ""}${person?.name ?? requester?.displayName ?? "이름 미상"}`;
  const { structuredFields = {}, freeTextSections = {} } = diff as {
    structuredFields?: Record<string, unknown>;
    freeTextSections?: Record<string, unknown>;
  };
  const changed = [...Object.keys(structuredFields), ...Object.keys(freeTextSections).map((k) => SECTION_LABELS[k] ?? k)];
  const text = `:pencil2: *${name}*님이 그핵드인 프로필 수정을 요청했습니다.\n바뀐 항목: ${changed.join(", ")}\n<https://admin.ghsnu.com/hr/admin|승인 큐 열기>`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(3000),
  }).catch((error) => console.error("[slack] edit request notify failed", error));
}
