-- 차수(cycles) 폐지 → 분기(quarters) 도입
--
-- 이 파일은 Prisma가 생성한 SQL이 아니라 손으로 쓴 것이다(conventions §7.3).
-- Prisma는 테이블·컬럼 "이름 변경"을 인식하지 못하고 DROP + CREATE로 만들어서
-- 기존 컨택 건·발송 이력의 FK가 전부 끊긴다. RENAME으로 처리하면 PK 값이 그대로
-- 유지되므로 참조를 다시 매핑할 필요가 아예 없다.
--
-- 배경: 프론트(apps/dh-frontend/src/listup/)가 모든 화면을 수주 분기로 묶는다.
-- 분기는 달력에서 유도되는 값이 아니라 담당자가 라벨을 직접 정하는 값이라서
-- 테이블로 관리한다. 전역 "현재 활성 분기" 상태는 두지 않는다.

-- ---------- 1. 레거시 탐색 테이블 제거 ----------
-- search_runs는 conditions_snapshot + job_id만 가진 껍데기였고, 이 테이블을 읽거나
-- 쓰는 API 라우트가 하나도 없었다(행도 0개). 명세의 새 search_runs는 구조가 전혀
-- 다르므로 다음 마이그레이션에서 새로 만든다.
DROP TABLE "dh"."search_runs";

-- 차수 시작 의도 레코드. 전역 활성 차수가 사라지면서 존재 이유가 없어졌다(행 0개).
DROP TABLE "dh"."cycle_start_intents";

-- ---------- 2. cycles → quarters ----------
ALTER TABLE "dh"."cycles" RENAME TO "quarters";
ALTER TABLE "dh"."quarters" RENAME CONSTRAINT "cycles_pkey" TO "quarters_pkey";
ALTER TABLE "dh"."quarters" RENAME CONSTRAINT "cycles_started_by_id_fkey" TO "quarters_created_by_id_fkey";

ALTER TABLE "dh"."quarters" RENAME COLUMN "name" TO "label";
ALTER TABLE "dh"."quarters" RENAME COLUMN "started_at" TO "created_at";
ALTER TABLE "dh"."quarters" RENAME COLUMN "ended_at" TO "closed_at";
ALTER TABLE "dh"."quarters" RENAME COLUMN "started_by_id" TO "created_by_id";

ALTER TABLE "dh"."quarters" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "dh"."quarters" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- 이미 끝난 차수는 닫힌 분기로 옮긴다.
UPDATE "dh"."quarters" SET "active" = false WHERE "closed_at" IS NOT NULL;

CREATE UNIQUE INDEX "quarters_label_key" ON "dh"."quarters"("label");

-- RENAME은 RLS 설정을 그대로 가져오지만, 새 테이블 이름으로 한 번 더 명시해 둔다
-- (conventions §9.1 — RLS를 켜는 것은 테이블 생성 절차의 일부다).
ALTER TABLE "dh"."quarters" ENABLE ROW LEVEL SECURITY;

-- ---------- 3. 참조하는 테이블의 컬럼 이름 변경 ----------
ALTER TABLE "dh"."outreaches" RENAME COLUMN "current_cycle_id" TO "quarter_id";
ALTER TABLE "dh"."outreaches" RENAME COLUMN "last_sent_cycle_id" TO "last_sent_quarter_id";
ALTER TABLE "dh"."outreaches" RENAME COLUMN "skip_cycle_id" TO "skip_quarter_id";
ALTER TABLE "dh"."outreaches" RENAME CONSTRAINT "outreaches_current_cycle_id_fkey" TO "outreaches_quarter_id_fkey";
ALTER TABLE "dh"."outreaches" RENAME CONSTRAINT "outreaches_last_sent_cycle_id_fkey" TO "outreaches_last_sent_quarter_id_fkey";
ALTER TABLE "dh"."outreaches" RENAME CONSTRAINT "outreaches_skip_cycle_id_fkey" TO "outreaches_skip_quarter_id_fkey";

ALTER TABLE "dh"."sent_messages" RENAME COLUMN "cycle_id" TO "quarter_id";
ALTER TABLE "dh"."sent_messages" RENAME CONSTRAINT "sent_messages_cycle_id_fkey" TO "sent_messages_quarter_id_fkey";

-- ---------- 4. companies — 발견 단계가 쓸 식별 컬럼 ----------
-- 발견은 기업을 처음 찾아낸 시점에 product/domain을 알 수 없다. 발송 쪽이 쓰던 두
-- 컬럼의 NOT NULL을 풀고, 명세의 기업 식별 필드를 추가한다. 컬럼 소유권 분리는
-- schema.prisma의 Company 주석과 conventions.md §4에 적어둔다.
ALTER TABLE "dh"."companies" ALTER COLUMN "product" DROP NOT NULL;
ALTER TABLE "dh"."companies" ALTER COLUMN "domain" DROP NOT NULL;

ALTER TABLE "dh"."companies" ADD COLUMN "legal_name" TEXT;
ALTER TABLE "dh"."companies" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "dh"."companies" ADD COLUMN "website_url" TEXT;
ALTER TABLE "dh"."companies" ADD COLUMN "canonical_domain" TEXT;
ALTER TABLE "dh"."companies" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "companies_canonical_domain_idx" ON "dh"."companies"("canonical_domain");

-- 별칭으로 기업을 찾는 목록 필터(GET /candidates?q=)용. 배열 포함 검사는 B-tree로
-- 못 타기 때문에 GIN이 필요하고, Prisma 스키마로는 표현할 수 없어 여기에 직접 쓴다.
CREATE INDEX "companies_aliases_idx" ON "dh"."companies" USING GIN ("aliases");

-- ---------- 5. enum ----------
-- enum 값은 추가만 가능하고 삭제할 수 없다(conventions §8). 기존 skipped_for_cycle은
-- 자리만 남기고 앞으로는 skipped_for_quarter를 쓴다.
ALTER TYPE "dh"."InternalDecision" ADD VALUE 'skipped_for_quarter';
