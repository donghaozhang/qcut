-- Widen agent_artifacts.bytes from int4 (~2.1 GB ceiling) to bigint so
-- multi-GB video artifacts don't overflow on insert. Drizzle schema is
-- the source of truth — keep packages/db/src/schema.ts in sync.
ALTER TABLE "agent_artifacts"
	ALTER COLUMN "bytes" TYPE bigint;
--> statement-breakpoint

-- The `claim_one_agent_job` RPC runs
--   WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED
-- on every worker tick. A plain index on (status) still forces a sort
-- on created_at. Replace it with a partial index covering both the
-- filter predicate and the sort column.
DROP INDEX IF EXISTS "agent_jobs_pending_idx";
--> statement-breakpoint
CREATE INDEX "agent_jobs_queued_created_idx"
	ON "agent_jobs" USING btree ("created_at")
	WHERE status = 'queued';
