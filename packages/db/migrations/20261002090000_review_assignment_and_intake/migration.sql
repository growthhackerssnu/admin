-- Fixed review assignments and a global gate for new collection runs.
-- The dates describe a planned work period; they do not change candidate state.
CREATE TABLE "dh"."review_assignment_batches" (
    "id" TEXT NOT NULL,
    "work_starts_on" DATE NOT NULL,
    "work_ends_on" DATE NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "eligible_count_at_snapshot" INTEGER NOT NULL,
    "per_member_count" INTEGER NOT NULL,
    "selected_member_count" INTEGER NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_assignment_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_assignment_batches_valid_counts_check" CHECK (
        "work_starts_on" <= "work_ends_on"
        AND "eligible_count_at_snapshot" >= 0
        AND "per_member_count" > 0
        AND "selected_member_count" > 0
        AND "eligible_count_at_snapshot" >= "per_member_count" * "selected_member_count"
    )
);

CREATE TABLE "dh"."review_assignment_items" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_assignment_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dh"."collection_intake_controls" (
    "id" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changed_by_id" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_intake_controls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "collection_intake_controls_singleton_check" CHECK ("id" = 'dh' AND "version" > 0)
);

CREATE INDEX "review_assignment_batches_created_at_idx" ON "dh"."review_assignment_batches"("created_at" DESC);
CREATE UNIQUE INDEX "review_assignment_items_candidate_id_key" ON "dh"."review_assignment_items"("candidate_id");
CREATE INDEX "review_assignment_items_batch_id_member_id_idx" ON "dh"."review_assignment_items"("batch_id", "member_id");
CREATE INDEX "review_assignment_items_member_id_assigned_at_idx" ON "dh"."review_assignment_items"("member_id", "assigned_at" DESC);
CREATE INDEX "candidates_research_status_review_status_review_owner_id_created_at_id_idx" ON "dh"."candidates"("research_status", "review_status", "review_owner_id", "created_at", "id");

ALTER TABLE "dh"."review_assignment_batches" ADD CONSTRAINT "review_assignment_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dh"."review_assignment_items" ADD CONSTRAINT "review_assignment_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "dh"."review_assignment_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dh"."review_assignment_items" ADD CONSTRAINT "review_assignment_items_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "dh"."candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dh"."review_assignment_items" ADD CONSTRAINT "review_assignment_items_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "core"."members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dh"."collection_intake_controls" ADD CONSTRAINT "collection_intake_controls_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "core"."members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "dh"."collection_intake_controls" ("id") VALUES ('dh');

-- Access is through the authenticated backend's Postgres connection, not the Data API.
ALTER TABLE "dh"."review_assignment_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."review_assignment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dh"."collection_intake_controls" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "dh"."review_assignment_batches" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."review_assignment_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "dh"."collection_intake_controls" FROM anon, authenticated;
