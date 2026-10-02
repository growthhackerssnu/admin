-- 읽기 전용 사전 점검. 운영 DB에 연결할 때 결과의 집계값만 공유한다.
-- 새 마이그레이션 적용 전 실행하며, 개인 연락처·메시지 본문은 조회하지 않는다.

SELECT 'companies' AS entity, count(*) AS rows FROM dh.companies
UNION ALL SELECT 'candidates', count(*) FROM dh.candidates
UNION ALL SELECT 'search_runs', count(*) FROM dh.search_runs
UNION ALL SELECT 'research_tasks', count(*) FROM dh.research_tasks
UNION ALL SELECT 'outreaches', count(*) FROM dh.outreaches
UNION ALL SELECT 'sent_messages', count(*) FROM dh.sent_messages
UNION ALL SELECT 'past_projects', count(*) FROM dh.past_projects;

SELECT work_stage, count(*) AS rows
FROM dh.outreaches
GROUP BY work_stage
ORDER BY work_stage;

SELECT status, count(*) AS rows
FROM dh.sent_messages
GROUP BY status
ORDER BY status;

-- Candidate 없이 과거 이력만 있는 기업도 새 연락 화면에서 찾아야 한다.
WITH candidate_company AS (
  SELECT DISTINCT company_id FROM dh.candidates
), project_company AS (
  SELECT DISTINCT company_id FROM dh.past_projects
), sent_company AS (
  SELECT DISTINCT o.company_id
  FROM dh.sent_messages AS s
  JOIN dh.outreaches AS o ON o.id = s.outreach_id
), relationship_company AS (
  SELECT company_id FROM project_company
  UNION
  SELECT company_id FROM sent_company
)
SELECT
  count(*) AS companies_with_history,
  count(*) FILTER (WHERE c.company_id IS NULL) AS history_without_candidate,
  count(*) FILTER (WHERE p.company_id IS NOT NULL AND s.company_id IS NULL) AS project_only,
  count(*) FILTER (WHERE s.company_id IS NOT NULL AND p.company_id IS NULL) AS sent_only,
  count(*) FILTER (WHERE p.company_id IS NOT NULL AND s.company_id IS NOT NULL) AS project_and_sent
FROM relationship_company AS r
LEFT JOIN candidate_company AS c ON c.company_id = r.company_id
LEFT JOIN project_company AS p ON p.company_id = r.company_id
LEFT JOIN sent_company AS s ON s.company_id = r.company_id;

-- 이미 적용된 migration과 실패 기록을 확인한다. 내부 테이블의 식별자만 조회한다.
SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations
ORDER BY started_at DESC;
