-- hr.edit_requests: 같은 notionPageId로 pending 행이 동시에 2개 이상 존재하지
-- 못하게 막는다.
--
-- 배경: 알럼나이가 이미 승인 대기 중인 수정 요청이 있는 상태에서 다시
-- 제출하면, 새 행을 추가하는 게 아니라 기존 pending 행을 덮어쓰는 방식으로
-- 설계했다(ARCHITECTURE.md §12.3.1). 애플리케이션 코드가 "pending 행이 있으면
-- UPDATE, 없으면 INSERT" 순서로 처리하긴 하지만, 그 사이 동시 요청이 들어오는
-- 경쟁 상태(race condition)까지 막으려면 DB 제약이 필요하다.
--
-- Prisma 문법으로 표현할 수 없어서(부분 유니크 인덱스) 직접 쓴다(§7.3) —
-- members_ops_role_singleton_key(20260927140000_add_member_ops_role)와 같은
-- 패턴. approved/rejected로 끝난 과거 요청은 여러 건 쌓여도 무방하므로 status
-- 조건으로 pending만 제한한다.

CREATE UNIQUE INDEX "edit_requests_pending_notion_page_id_key"
  ON "hr"."edit_requests" ("notion_page_id")
  WHERE "status" = 'pending';
