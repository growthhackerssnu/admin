-- core.members에 운영팀 직책(ops_role) 추가
--
-- 배경: 어드민 회원 관리 화면이 지금까지 acting/alumni만 구분했는데, acting에
-- 대해서는 "이 사람이 운영팀에서 무슨 일을 하는지"도 같이 관리하기로 했다.
--
-- 이 컬럼이 core에 있는 이유(conventions §5.3과의 관계): §5.3이 금지하는 것은
-- dh·hr이 자기 업무용 정보를 core.members에 붙이는 것이다. 운영팀 직책은 특정
-- 앱의 업무 데이터가 아니라 학회 차원의 신원 정보이고, 쓰는 쪽은 portal 하나다
-- (admin 화면). 세 앱이 같은 의미로 읽는 필드라서 core에 둔다.
--
-- 규칙 세 가지:
--   1. alumni·admin은 ops_role이 NULL이다            → 아래 CHECK 제약
--   2. 회장·부회장·총무·각 팀장은 한 명씩이다          → 아래 부분 유니크 인덱스
--   3. acting이면 ops_role이 있어야 한다             → API에서만 검사한다(아래 참고)
--
-- 3번을 DB 제약으로 걸지 않는 이유: 이 컬럼이 생기기 전에 등록된 acting 행은
-- ops_role이 NULL이다. CHECK 제약은 그 행을 UPDATE할 때도(컬럼이 SET 목록에
-- 없어도) 재검사되므로, 로그인 시 last_login_at을 갱신하는 것만으로 기존 acting
-- 회원 전원이 403이 된다. 그래서 기존 행은 NULL로 살려두고(어드민 화면에
-- "미지정"으로 보인다) role 전환·직책 지정 경로에서만 강제한다. 값을 임의로
-- 채워넣는 백필도 하지 않는다 — 누가 어느 팀인지 DB가 지어낼 수 없다.

-- ---------- enum ----------
-- 에듀는 팀장만 있다. 팀원이 생기면 ALTER TYPE ... ADD VALUE로 추가한다(§8).

CREATE TYPE "core"."OpsRole" AS ENUM (
  'president',
  'vice_president',
  'treasurer',
  'external_lead',
  'external_member',
  'hr_lead',
  'hr_member',
  'pr_lead',
  'pr_member',
  'edu_lead'
);

-- ---------- 컬럼 ----------
-- nullable로 추가한다 = §9.2 확장(expand) 단계. 아직 배포 전인 앱이 있어도 안 깨진다.

ALTER TABLE "core"."members" ADD COLUMN "ops_role" "core"."OpsRole";

-- ---------- 규칙 1: acting이 아니면 직책이 없다 ----------
-- 현재 모든 행이 NULL이라 곧바로 VALIDATE된다.

ALTER TABLE "core"."members"
  ADD CONSTRAINT "members_ops_role_acting_only"
  CHECK ("ops_role" IS NULL OR "role" = 'acting');

-- ---------- 규칙 2: 1인 직책의 유일성 ----------
-- Prisma 문법으로 표현할 수 없어서 직접 쓴다(§7.3). 팀원은 여러 명이라 제외한다.
-- 비활성(active = false) 회원도 자리를 차지한다 — 직책은 role과 함께만 움직이고,
-- 비활성화는 role을 바꾸지 않기 때문이다. 자리를 비우려면 그 회원을 alumni로
-- 내리거나(직책이 NULL이 된다) 다른 직책으로 옮긴다.

CREATE UNIQUE INDEX "members_ops_role_singleton_key"
  ON "core"."members" ("ops_role")
  WHERE "ops_role" IN (
    'president',
    'vice_president',
    'treasurer',
    'external_lead',
    'hr_lead',
    'pr_lead',
    'edu_lead'
  );
