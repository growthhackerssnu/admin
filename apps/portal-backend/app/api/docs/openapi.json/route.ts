import { NextResponse } from "next/server";
import { apiDocsEnabled } from "@/lib/openapi/enabled";
import { buildOpenApiDocument } from "@/lib/openapi/registry";

export const dynamic = "force-dynamic";

// GET /api/docs/openapi.json — Swagger UI가 읽어가는 OpenAPI 명세.
export function GET() {
  if (!apiDocsEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.json(buildOpenApiDocument());
}
