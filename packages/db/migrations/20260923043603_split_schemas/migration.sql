-- 스키마 분리: public 하나 -> core / dh / hr
--
-- 규칙과 배경은 docs/db/conventions.md §2, §3. 요약하면 세 앱(portal/dh/hr)이 DB
-- 하나를 공유하는데 경계가 눈에 보이지 않아서, Postgres 스키마로 소유 영역을 나눈다.
--
-- 이 파일은 Prisma가 생성한 SQL이 아니라 손으로 쓴 것이다. Prisma는 테이블의 스키마
-- 이동을 "DROP 후 CREATE"로 해석해서 데이터를 전부 날리므로, --create-only로 빈
-- 마이그레이션을 만든 뒤 ALTER ... SET SCHEMA로 교체했다.
--
-- ALTER TABLE ... SET SCHEMA는 그 테이블의 인덱스/PK/FK/제약조건을 함께 옮긴다.
-- 따로 옮길 필요가 없다. enum 타입은 테이블과 별개라 ALTER TYPE으로 따로 옮긴다.

-- ---------- 스키마 생성 ----------

CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "dh";
-- hr은 아직 테이블이 없다. 자리만 만들어두고, hr 담당자가 첫 테이블을 가져오면
-- 그때 schema.prisma의 schemas 배열에 "hr"을 추가한다.
CREATE SCHEMA IF NOT EXISTS "hr";

-- ---------- enum 타입 이동 ----------
-- Prisma가 만든 enum 타입 이름은 PascalCase 따옴표 식별자다. 따옴표를 빼면 못 찾는다.

ALTER TYPE "Role" SET SCHEMA "core";
ALTER TYPE "SignupRequestStatus" SET SCHEMA "core";

ALTER TYPE "Channel" SET SCHEMA "dh";
ALTER TYPE "Route" SET SCHEMA "dh";
ALTER TYPE "WorkStage" SET SCHEMA "dh";
ALTER TYPE "InternalDecision" SET SCHEMA "dh";
ALTER TYPE "ResponseResult" SET SCHEMA "dh";
ALTER TYPE "ResponseCategory" SET SCHEMA "dh";
ALTER TYPE "SendStatus" SET SCHEMA "dh";
ALTER TYPE "JobType" SET SCHEMA "dh";
ALTER TYPE "JobStatus" SET SCHEMA "dh";
ALTER TYPE "DraftOrigin" SET SCHEMA "dh";

-- ---------- core 테이블 (소유자: portal) ----------

ALTER TABLE "members" SET SCHEMA "core";
ALTER TABLE "people_directory" SET SCHEMA "core";
ALTER TABLE "signup_requests" SET SCHEMA "core";

-- ---------- dh 테이블 (소유자: dh) ----------

ALTER TABLE "cycles" SET SCHEMA "dh";
ALTER TABLE "cycle_start_intents" SET SCHEMA "dh";
ALTER TABLE "search_runs" SET SCHEMA "dh";
ALTER TABLE "companies" SET SCHEMA "dh";
ALTER TABLE "contacts" SET SCHEMA "dh";
ALTER TABLE "contact_endpoints" SET SCHEMA "dh";
ALTER TABLE "prelaunch_contacts" SET SCHEMA "dh";
ALTER TABLE "outreaches" SET SCHEMA "dh";
ALTER TABLE "templates" SET SCHEMA "dh";
ALTER TABLE "message_draft_revisions" SET SCHEMA "dh";
ALTER TABLE "sent_messages" SET SCHEMA "dh";
ALTER TABLE "responses" SET SCHEMA "dh";
ALTER TABLE "past_projects" SET SCHEMA "dh";
ALTER TABLE "jobs" SET SCHEMA "dh";

-- dh -> core.members 방향 외래키 7개가 이 시점부터 스키마를 가로지른다.
-- Postgres에서 정상이고, conventions.md §5.3이 요구하는 방향(업무 스키마 -> core)이다.

-- ---------- idempotency_keys 분리 ----------
--
-- portal과 dh가 물리 테이블 하나를 공유하고 있었다. 공유 도메인 데이터가 아니라
-- 각 앱의 내부 구현 디테일이므로(conventions.md §4.1) 앱마다 자기 테이블을 갖는다.
-- 기존 테이블은 dh가 가져가고, portal용을 core에 새로 만든다.
--
-- 기존 행은 이관하지 않고 버린다. 수명이 짧은 재시도 방지용 레코드이고, 두 앱의
-- 키가 섞여 있어 분류할 방법도 없다(route 문자열로 추정은 가능하지만 신뢰할 수
-- 없다). 적용 직후 진행 중이던 재시도가 있으면 한 번 더 실행될 수 있으므로
-- 트래픽이 없는 시간에 적용한다.

ALTER TABLE "idempotency_keys" SET SCHEMA "dh";
TRUNCATE TABLE "dh"."idempotency_keys";

CREATE TABLE "core"."idempotency_keys" (
    "key" TEXT NOT NULL,
    "actor_member_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "core"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_actor_member_id_fkey"
    FOREIGN KEY ("actor_member_id") REFERENCES "core"."members"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
