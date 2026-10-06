import { withApiHandler } from "@/nut/lib/apiHandler";
import { ApiError } from "@/nut/lib/errors";
import { overviewBody, periodFrom } from "@/nut/lib/respond";
import {
  createBudgetParameter,
  DERIVED_PARAMETERS,
  deleteBudgetParameter,
  updateBudgetParameter,
} from "@/nut/lib/financeRepository";

function idValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(value))
    throw new ApiError(
      "BAD_REQUEST",
      "id는 영문 소문자·숫자·하이픈으로 작성해야 합니다.",
    );
  if (DERIVED_PARAMETERS.some((derived) => derived.id === value))
    throw new ApiError("BAD_REQUEST", `'${value}'는 자동으로 계산되는 기준이라 쓸 수 없습니다.`);
  return value;
}

function textValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError("BAD_REQUEST", `${field} is required.`);
  return value.trim();
}

// 달러 단가·개월 수처럼 소수가 있을 수 있다.
function numberValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ApiError("BAD_REQUEST", "0 이상의 숫자를 입력하세요.");
  return value;
}

export const POST = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const periodId = await createBudgetParameter(await periodFrom(body.periodId), {
    id: idValue(body.id),
    label: textValue(body.label, "label"),
    value: numberValue(body.value),
    unit: textValue(body.unit, "unit"),
    description: typeof body.description === "string" ? body.description.trim() : "",
    category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : "기타",
  });
  return { body: await overviewBody(periodId, member, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as {
    periodId?: unknown;
    id?: unknown;
    value?: unknown;
    label?: unknown;
    unit?: unknown;
    description?: unknown;
  } | null;
  if (!body || typeof body.id !== "string" || !body.id.trim())
    throw new ApiError("BAD_REQUEST", "id is required.");
  const input = {
    ...(body.value === undefined ? {} : { value: numberValue(body.value) }),
    ...(body.label === undefined
      ? {}
      : { label: textValue(body.label, "label") }),
    ...(body.unit === undefined ? {} : { unit: textValue(body.unit, "unit") }),
    ...(body.description === undefined
      ? {}
      : { description: textValue(body.description, "description") }),
  };
  if (Object.keys(input).length === 0)
    throw new ApiError("BAD_REQUEST", "변경할 값을 입력하세요.");
  const periodId = await updateBudgetParameter(await periodFrom(body.periodId), body.id, input);
  return { body: await overviewBody(periodId, member, requestId) };
});

export const DELETE = withApiHandler(async (req, { member, requestId }) => {
  const body = (await req.json().catch(() => null)) as { periodId?: unknown; id?: unknown } | null;
  if (!body || typeof body.id !== "string" || !body.id.trim())
    throw new ApiError("BAD_REQUEST", "id is required.");
  const periodId = await deleteBudgetParameter(await periodFrom(body.periodId), body.id.trim());
  return { body: await overviewBody(periodId, member, requestId) };
});
