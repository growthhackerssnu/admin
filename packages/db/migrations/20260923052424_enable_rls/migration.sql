-- 전 테이블 RLS 활성화 (기본 거부)
--
-- 배경은 docs/db/conventions.md §6.2. 요약하면: Data API(PostgREST)에 스키마를
-- 노출하는 순간, RLS가 꺼진 테이블은 anon key만 있으면 누구나 읽을 수 있게 된다.
-- anon key는 프론트 번들에 들어가는 공개된 값이라 비밀이 아니다.
--
-- 지금은 어느 스키마도 노출돼 있지 않고 anon/authenticated에 테이블 권한도 없어서
-- 당장 달라지는 동작은 없다. 나중에 프론트 직접 조회를 열 때(§6.7) 테이블 하나를
-- 빠뜨려서 생기는 사고를 미리 막는 것이 목적이다.
--
-- 앱에는 영향이 없다: 앱이 접속하는 postgres 역할은 rolbypassrls=true이고 모든
-- 테이블의 소유자다. RLS는 anon/authenticated 같은 비특권 역할에만 적용된다.
--
-- 정책(policy)은 하나도 만들지 않는다. RLS를 켜면 기본이 전부 거부이므로, 이
-- 상태가 곧 "아무도 못 읽는다"다. 프론트에 실제로 열 때 그 테이블/뷰에만 정책을
-- 붙인다(§6.3의 core.current_member_role() 기반).

-- ---------- core (소유자: portal) ----------

ALTER TABLE "core"."members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."people_directory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."signup_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."idempotency_keys" ENABLE ROW LEVEL SECURITY;

-- ---------- dh (소유자: dh) ----------

ALTER TABLE "dh"."cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."cycle_start_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."search_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."contact_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."prelaunch_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."outreaches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."message_draft_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."sent_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."past_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."idempotency_keys" ENABLE ROW LEVEL SECURITY;
