-- ghbot MCP 서버의 OAuth 상태 저장소. 키는 원문 토큰이 아니라 SHA-256 해시를 쓴다.
CREATE TABLE "ghbot"."oauth_entries" (
  "key" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_entries_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "oauth_entries_expires_at_idx" ON "ghbot"."oauth_entries"("expires_at");
