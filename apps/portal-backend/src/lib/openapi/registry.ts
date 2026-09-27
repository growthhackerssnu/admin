import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ErrorCode } from "../errors";
import { OPS_ROLES } from "../opsRoles";
import { bulkDeactivateSchema, bulkRoleChangeSchema } from "../validation/admin";

// zod에 .openapi() 를 붙인다. 여기서 한 번만 호출하면 되고, 이 모듈을 import하는
// 쪽(문서 라우트)에서만 로드되므로 런타임 검증 경로에는 영향이 없다.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description:
    "Supabase 세션 access token. 프론트에서 로그인 후 supabase.auth.getSession()의 access_token을 그대로 넣으면 된다.",
});

// ---------------------------------------------------------------------------
// 공통 스키마 — 응답 봉투는 lib/errors.ts의 successBody/errorBody와 같은 모양이다.
// ---------------------------------------------------------------------------

const errorBodySchema = registry.register(
  "ErrorBody",
  z.object({
    error: z.object({
      code: z.enum(Object.keys(ErrorCode) as [string, ...string[]]),
      message: z.string(),
      fieldErrors: z.record(z.string()).optional(),
      retryable: z.boolean(),
    }),
    requestId: z.string().uuid(),
  }),
);

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, requestId: z.string().uuid() });
}

function json<T extends z.ZodTypeAny>(description: string, schema: T) {
  return { description, content: { "application/json": { schema } } };
}

function error(description: string) {
  return json(description, errorBodySchema);
}

// 모든 admin 엔드포인트가 공유하는 실패 응답.
const commonErrors = {
  401: error("토큰이 없거나 만료됨 (UNAUTHENTICATED)"),
  403: error("members 화이트리스트에 없거나 admin이 아님 (FORBIDDEN)"),
  500: error("서버 내부 오류 (INTERNAL_ERROR)"),
};

// 변경 계열(PATCH/POST)이 추가로 낼 수 있는 실패 응답.
const mutationErrors = {
  404: error("존재하지 않는 회원이 memberIds에 포함됨 (NOT_FOUND)"),
  409: error("같은 Idempotency-Key로 다른 payload를 보냄 (IDEMPOTENCY_CONFLICT)"),
  422: error("입력값 검증 실패 또는 Idempotency-Key 헤더 누락 (VALIDATION_ERROR)"),
};

// withIdempotency가 요구하는 헤더 — 변경 계열 전부에 필수다.
const idempotencyHeaders = z.object({
  "idempotency-key": z
    .string()
    .min(1)
    .openapi({
      description:
        "이 '행동' 하나를 식별하는 임의의 키(UUID 권장). 같은 키로 재시도하면 이전 응답이 그대로 재반환된다.",
      example: "b6f0a2c4-1f53-4a0e-9d9e-0f2c3b7a91d2",
    }),
});

const memberIdExample = ["clx1a2b3c0000aaaabbbbcccc"];

// ---------------------------------------------------------------------------
// GET /api/v1/admin/members
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/v1/admin/members",
  tags: ["admin/members"],
  summary: "회원 명단 조회",
  description:
    "admin 전용. createdAt 내림차순 커서 페이지네이션이며, cohort는 연결된 people_directory 항목에서 온다(없으면 null). opsRole은 acting에게만 값이 있다.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .openapi({ description: "한 페이지 개수. 기본 100, 최대 200(초과하면 200으로 잘림).", example: 100 }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: "이전 응답의 nextCursor. 없으면 첫 페이지." }),
    }),
  },
  responses: {
    200: json(
      "회원 목록",
      envelope(
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              displayName: z.string(),
              cohort: z.string().nullable(),
              email: z.string().email(),
              role: z.enum(["admin", "acting", "alumni"]),
              opsRole: z
                .enum(OPS_ROLES)
                .nullable()
                .openapi({
                  description:
                    "운영팀 직책. acting에게만 값이 있다. acting인데 null이면 이 컬럼이 생기기 전에 등록된 회원(직책 미지정).",
                }),
              active: z.boolean(),
              createdAt: z.string().datetime(),
              lastLoginAt: z.string().datetime().nullable(),
            }),
          ),
          nextCursor: z.string().nullable().openapi({ description: "다음 페이지가 없으면 null." }),
        }),
      ),
    ),
    ...commonErrors,
  },
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/members/role
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "patch",
  path: "/api/v1/admin/members/role",
  tags: ["admin/members"],
  summary: "role·운영팀 직책 일괄 변경 (acting ↔ alumni)",
  description:
    [
      "admin으로의 승격은 이 API로 불가능하다(스키마가 acting/alumni만 받는다). 대상 중 현재 role이 admin인 사람이 하나라도 있으면 통째로 403.",
      "role과 운영팀 직책(opsRole)은 항상 같이 바뀐다. `acting`이면 opsRole이 필수이고, `alumni`면 opsRole은 null이 된다(보내면 422).",
      "회장·부회장·총무·각 팀장은 한 명씩이다 — 이미 그 직책인 회원이 있거나 memberIds가 둘 이상이면 422.",
      "이미 acting인 회원에게 다시 호출하면 직책만 바뀐다.",
    ].join(" "),
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeaders,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: registry.register(
            "BulkRoleChange",
            bulkRoleChangeSchema.openapi({
              example: { memberIds: memberIdExample, role: "acting", opsRole: "hr_member" },
            }),
          ),
        },
      },
    },
  },
  responses: {
    200: json(
      "변경된 회원의 id와 새 role·운영팀 직책",
      envelope(
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              role: z.enum(["admin", "acting", "alumni"]),
              opsRole: z.enum(OPS_ROLES).nullable(),
            }),
          ),
        }),
      ),
    ),
    ...commonErrors,
    ...mutationErrors,
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/members/deactivate
// ---------------------------------------------------------------------------

const bulkMemberIds = registry.register(
  "BulkMemberIds",
  bulkDeactivateSchema.openapi({ example: { memberIds: memberIdExample } }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/members/deactivate",
  tags: ["admin/members"],
  summary: "회원 일괄 비활성화",
  description:
    "행을 지우지 않고 active=false로만 바꾼다(업무 기록의 참조가 깨지지 않게). 본인 계정과 admin 계정은 대상이 될 수 없다.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeaders,
    body: { required: true, content: { "application/json": { schema: bulkMemberIds } } },
  },
  responses: {
    200: json(
      "변경된 회원의 id와 active",
      envelope(z.object({ items: z.array(z.object({ id: z.string(), active: z.boolean() })) })),
    ),
    ...commonErrors,
    ...mutationErrors,
  },
});

// ---------------------------------------------------------------------------
// POST /api/v1/admin/members/reactivate
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/members/reactivate",
  tags: ["admin/members"],
  summary: "회원 일괄 재활성화",
  description: "deactivate를 되돌린다. 같은 요청 스키마를 쓴다.",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeaders,
    body: { required: true, content: { "application/json": { schema: bulkMemberIds } } },
  },
  responses: {
    200: json(
      "변경된 회원의 id와 active",
      envelope(z.object({ items: z.array(z.object({ id: z.string(), active: z.boolean() })) })),
    ),
    ...commonErrors,
    ...mutationErrors,
  },
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "portal-backend admin API",
      version: "0.1.0",
      description:
        "admin.ghsnu.com 회원 관리 API. 요청 바디 스키마는 src/lib/validation/admin.ts의 Zod 스키마에서 그대로 생성되므로, 검증 규칙을 고치면 이 문서도 같이 바뀐다.",
    },
    servers: [{ url: "http://localhost:3001", description: "로컬 개발" }],
    tags: [{ name: "admin/members", description: "회원 명단·role·활성 상태 관리 (admin 전용)" }],
  });
}
