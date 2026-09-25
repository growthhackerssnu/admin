import type { Route } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// 목업/dh-bot-data-model.md가 확인한, policy.js가 실제로 쓰는 변수 6개뿐.
// 실제 지정 템플릿을 받으면 이 목록도 같이 확정한다.
const REQUIRED_VARIABLES = [
  "companyName",
  "product",
  "recipientName",
  "recipientRole",
  "topic",
  "senderName",
];

// #10 GET /template-bindings?route
// 연결 상태·필요 변수만 내려준다. subject/body 원문은 브라우저로 보내지 않는다
// (api-contract.md가 지적한 "TemplateBindings가 subject/body를 요구하는" 문제를
// 여기서는 처음부터 metadata 전용으로 설계해서 피한다).
export const GET = withApiHandler(async (req, { requestId }) => {
  const { searchParams } = new URL(req.url);
  const routeFilter = searchParams.get("route") as Route | null;

  const templates = await prisma.template.findMany({
    where: { active: true, ...(routeFilter ? { route: routeFilter } : {}) },
  });

  const byRoute = new Map(templates.map((t) => [`${t.route}:${t.channel}`, t]));
  const routes: Route[] = routeFilter
    ? [routeFilter]
    : ["new", "alternate_contact", "recontact", "repeat_collaboration"];

  const items = routes.map((route) => {
    const email = byRoute.get(`${route}:email`);
    return {
      route,
      connected: Boolean(email),
      templateId: email?.id ?? null,
      templateVersion: email?.version ?? null,
      requiredVariables: REQUIRED_VARIABLES,
    };
  });

  return { body: successBody({ items }, requestId) };
});
