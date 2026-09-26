import type { Route } from "@/generated/prisma";
import { withApiHandler } from "@/lib/apiHandler";
import { listBody } from "@/lib/errors";
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

// GET /template-bindings?route
// 연결 상태·필요 변수만 내려준다. subject/body 원문은 브라우저로 보내지 않는다.
export const GET = withApiHandler(async (req) => {
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
      template_id: email?.id ?? null,
      template_version: email?.version ?? null,
      required_variables: REQUIRED_VARIABLES,
    };
  });

  // 경로 4개 고정 목록이라 페이지네이션하지 않는다.
  return { body: listBody(items, { nextCursor: null, hasMore: false }) };
});
