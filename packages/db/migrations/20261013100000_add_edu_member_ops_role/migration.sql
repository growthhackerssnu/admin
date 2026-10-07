-- 에듀 팀원 직책 추가. 새 enum 값은 같은 트랜잭션 안에서 쓸 수 없어서 따로 둔다.
ALTER TYPE "core"."OpsRole" ADD VALUE IF NOT EXISTS 'edu_member';
