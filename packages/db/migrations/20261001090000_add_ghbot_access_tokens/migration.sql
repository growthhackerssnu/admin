-- ghbot 구성원 토큰은 portal의 회원 권한(role/active)에 종속된다.
-- 원문 토큰은 저장하지 않고 SHA-256 해시만 저장한다.

CREATE TABLE "core"."ghbot_access_tokens" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "issued_by_member_id" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "ghbot_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ghbot_access_tokens_token_hash_key"
  ON "core"."ghbot_access_tokens"("token_hash");
CREATE INDEX "ghbot_access_tokens_member_id_idx"
  ON "core"."ghbot_access_tokens"("member_id");
CREATE INDEX "ghbot_access_tokens_revoked_at_idx"
  ON "core"."ghbot_access_tokens"("revoked_at");

-- 재발급은 기존 토큰을 폐기한 뒤 새 토큰을 넣는 한 트랜잭션으로 처리한다.
-- 회원당 유효 토큰 하나만 허용해, 분실/퇴임 시 회수 범위를 명확하게 한다.
CREATE UNIQUE INDEX "ghbot_access_tokens_one_active_per_member"
  ON "core"."ghbot_access_tokens"("member_id")
  WHERE "revoked_at" IS NULL;

ALTER TABLE "core"."ghbot_access_tokens"
  ADD CONSTRAINT "ghbot_access_tokens_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "core"."ghbot_access_tokens"
  ADD CONSTRAINT "ghbot_access_tokens_issued_by_member_id_fkey"
  FOREIGN KEY ("issued_by_member_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
