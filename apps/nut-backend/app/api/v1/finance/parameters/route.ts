import { withApiHandler } from "@/lib/apiHandler";
import { ApiError, successBody } from "@/lib/errors";
import {
  createBudgetParameter,
  deleteBudgetParameter,
  ParameterInUseError,
  updateBudgetParameter,
} from "@/lib/financeRepository";

function idValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(value))
    throw new ApiError(
      "BAD_REQUEST",
      "id는 영문 소문자·숫자·하이픈으로 작성해야 합니다.",
    );
  return value;
}

function textValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim())
    throw new ApiError("BAD_REQUEST", `${field} is required.`);
  return value.trim();
}

function numberValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ApiError("BAD_REQUEST", "value must be a non-negative number.");
  return Math.round(value);
}

export const POST = withApiHandler(async (req, { requestId }) => {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) throw new ApiError("BAD_REQUEST", "JSON body is required.");
  const result = await createBudgetParameter({
    id: idValue(body.id),
    label: textValue(body.label, "label"),
    value: numberValue(body.value),
    unit: textValue(body.unit, "unit"),
    description: textValue(body.description, "description"),
  });
  return { body: successBody(result.overview, requestId), status: 201 };
});

export const PATCH = withApiHandler(async (req, { requestId }) => {
  const body = (await req.json().catch(() => null)) as {
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
  const result = await updateBudgetParameter(body.id, input);
  return { body: successBody(result.overview, requestId) };
});

export const DELETE = withApiHandler(async (req, { requestId }) => {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string" || !body.id.trim())
    throw new ApiError("BAD_REQUEST", "id is required.");
  try {
    const result = await deleteBudgetParameter(body.id.trim());
    return { body: successBody(result.overview, requestId) };
  } catch (error) {
    if (error instanceof ParameterInUseError)
      throw new ApiError("BAD_REQUEST", error.message);
    throw error;
  }
});
