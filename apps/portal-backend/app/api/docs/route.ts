import { NextResponse } from "next/server";
import { apiDocsEnabled } from "@/lib/openapi/enabled";

export const dynamic = "force-dynamic";

const SWAGGER_UI_VERSION = "5.17.14";

// GET /api/docs — Swagger UI 페이지. UI 자산은 CDN에서 받고, 명세는 같은
// 오리진의 /api/docs/openapi.json에서 읽는다.
const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>portal-backend admin API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        defaultModelsExpandDepth: 0,
      });
    </script>
  </body>
</html>
`;

export function GET() {
  if (!apiDocsEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
