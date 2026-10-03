-- CreateIndex
CREATE INDEX "outreaches_work_stage_updated_at_idx" ON "dh"."outreaches"("work_stage", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "outreaches_owner_id_updated_at_idx" ON "dh"."outreaches"("owner_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "outreaches_updated_at_idx" ON "dh"."outreaches"("updated_at" DESC);

