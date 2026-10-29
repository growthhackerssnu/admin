-- 노션 "직책"·"소속팀" ↔ 운영팀 직책(core.member_ops_roles) 양방향 동기화의 기준값.
-- 마지막으로 맞춘 노션 쪽 값을 들고 있다가, 다음 동기화 때 노션이 그 값에서 바뀌었으면 노션을,
-- 아니면 어드민 쪽 변경을 따른다. ops_roles_synced_at이 NULL이면 아직 기준값이 없는 행이다.
ALTER TABLE "core"."people_directory"
  ADD COLUMN "notion_ops_roles" "core"."OpsRole"[] NOT NULL DEFAULT ARRAY[]::"core"."OpsRole"[],
  ADD COLUMN "ops_roles_synced_at" TIMESTAMP(3);
