-- Gemini 호출별 사용량(토큰·검색 횟수). 관리자 비용 화면이 단가를 곱해 LLM 비용을 낸다.
CREATE TABLE "dh"."ai_usage_events" (
  "id" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "web_search_calls" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_events_created_at_idx" ON "dh"."ai_usage_events"("created_at");

ALTER TABLE "dh"."ai_usage_events" ENABLE ROW LEVEL SECURITY;
