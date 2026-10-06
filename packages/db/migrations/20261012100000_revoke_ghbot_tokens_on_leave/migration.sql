-- 회원이 acting이 아니게 되거나(alumni 전환) 비활성화되면 GH Bot API 키를 바로 폐기한다.
-- 관리자 화면·CLI·SQL 어느 경로로 바뀌어도 걸리도록 앱 코드 대신 트리거로 건다.
-- (인증 API도 acting·활성 회원의 토큰만 받지만, 다시 acting이 돼도 옛 키가 살아나지 않게 한다.)
-- admin은 토큰 발급 대상이 아니므로 acting이 아닌 모든 role을 같은 '떠남'으로 본다.
CREATE FUNCTION "ghbot"."revoke_tokens_on_member_leave"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."role" <> 'acting' OR NOT NEW."active")
     AND (OLD."role" = 'acting' AND OLD."active") THEN
    UPDATE "ghbot"."ghbot_access_tokens"
       SET "revoked_at" = now()
     WHERE "member_id" = NEW."id" AND "revoked_at" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "members_revoke_ghbot_tokens"
  AFTER UPDATE OF "role", "active" ON "core"."members"
  FOR EACH ROW EXECUTE FUNCTION "ghbot"."revoke_tokens_on_member_leave"();

-- 이미 떠난 회원에게 남아 있는 키도 지금 폐기한다.
UPDATE "ghbot"."ghbot_access_tokens" AS t
   SET "revoked_at" = now()
  FROM "core"."members" AS m
 WHERE t."member_id" = m."id" AND t."revoked_at" IS NULL
   AND (m."role" <> 'acting' OR NOT m."active");
