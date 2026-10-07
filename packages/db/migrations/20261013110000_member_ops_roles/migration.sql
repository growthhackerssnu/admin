-- 운영팀 직책을 회원당 하나(core.members.ops_role)에서 여럿(core.member_ops_roles)으로.
--
-- 바뀐 규칙:
--   1. 한 사람이 직책(회장·부회장·총무·각 팀장)은 하나만, 팀원은 여러 팀에 동시에 할 수 있다.
--      예: 총무이면서 대외협력 팀원·에듀 팀원, 회장이면서 PR 팀원.
--   2. 같은 직책은 기수마다 한 명이다. 인수인계 기간엔 19기 회장과 20기 회장이 함께 있을 수 있다.
--
-- expand-contract(conventions §9.2)의 확장 단계다. members.ops_role은 그대로 두고 값을 복사만 한다
-- — 이 마이그레이션 뒤 새 코드가 배포되기 전까지 옛 코드가 계속 그 컬럼을 읽기 때문이다.
-- 새 코드는 그 컬럼을 읽지 않고, 축소 단계에서 지운다.

CREATE TABLE "core"."member_ops_roles" (
  "member_id"  TEXT NOT NULL,
  "ops_role"   "core"."OpsRole" NOT NULL,
  "cohort"     INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_ops_roles_pkey" PRIMARY KEY ("member_id", "ops_role"),
  CONSTRAINT "member_ops_roles_member_id_fkey" FOREIGN KEY ("member_id")
    REFERENCES "core"."members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "member_ops_roles_cohort_positive" CHECK ("cohort" IS NULL OR "cohort" > 0)
);

CREATE INDEX "member_ops_roles_ops_role_idx" ON "core"."member_ops_roles"("ops_role");

-- ---------- 규칙 (Prisma로 표현할 수 없어서 직접 쓴다, §7.3) ----------
-- 직책 목록은 src/portal/lib/opsRoles.ts의 OFFICE와 같다.

-- 한 사람은 직책을 하나만.
CREATE UNIQUE INDEX "member_ops_roles_one_office_key"
  ON "core"."member_ops_roles" ("member_id")
  WHERE "ops_role" IN ('president', 'vice_president', 'treasurer', 'external_lead', 'hr_lead', 'pr_lead', 'edu_lead');

-- 같은 직책·같은 기수는 한 명만.
CREATE UNIQUE INDEX "member_ops_roles_office_cohort_key"
  ON "core"."member_ops_roles" ("ops_role", "cohort")
  WHERE "ops_role" IN ('president', 'vice_president', 'treasurer', 'external_lead', 'hr_lead', 'pr_lead', 'edu_lead')
    AND "cohort" IS NOT NULL;

-- 기수를 모르는 직책(아래 복사에서 기수를 못 찾은 옛 데이터)은 직책마다 한 명만. NULL끼리는 위 인덱스에서
-- 서로 다른 값으로 취급돼서 따로 막는다. 새로 지정하는 직책은 API가 기수를 반드시 받는다.
CREATE UNIQUE INDEX "member_ops_roles_office_unknown_cohort_key"
  ON "core"."member_ops_roles" ("ops_role")
  WHERE "ops_role" IN ('president', 'vice_president', 'treasurer', 'external_lead', 'hr_lead', 'pr_lead', 'edu_lead')
    AND "cohort" IS NULL;

-- 프론트에 열 계획은 없지만 테이블 생성 절차대로 켠다(§6.2, §9.1).
ALTER TABLE "core"."member_ops_roles" ENABLE ROW LEVEL SECURITY;

-- ---------- 기존 직책 복사 ----------
-- 직책의 기수는 그 회원이 가입 때 인증한 그핵드인 명단의 기수다("19기"처럼 섞여 있어도 cohort_normalized는 숫자).
-- 명단에 없으면 NULL로 둔다 — 화면에 '기수 미지정'으로 보이고 관리자가 채운다.
-- 옛 컬럼에서 직책은 이미 한 명씩이라(members_ops_role_singleton_key) 위 인덱스와 부딪히지 않는다.
INSERT INTO "core"."member_ops_roles" ("member_id", "ops_role", "cohort")
SELECT m."id",
       m."ops_role",
       CASE
         WHEN m."ops_role" IN ('president', 'vice_president', 'treasurer', 'external_lead', 'hr_lead', 'pr_lead', 'edu_lead')
          AND d."cohort_normalized" ~ '^[0-9]{1,6}$'
          AND d."cohort_normalized"::INTEGER > 0
         THEN d."cohort_normalized"::INTEGER
       END
FROM "core"."members" m
LEFT JOIN "core"."people_directory" d ON d."claimed_by_member_id" = m."id"
WHERE m."ops_role" IS NOT NULL;
