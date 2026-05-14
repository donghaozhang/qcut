CREATE TABLE "agent_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"command" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"claimed_at" timestamp,
	"finished_at" timestamp,
	"exit_code" integer,
	"error" text,
	"runner_id" text
);
--> statement-breakpoint
ALTER TABLE "agent_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" text,
	"user_id" text,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"bytes" integer,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sandbox_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"image_tag" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"last_input_at" timestamp,
	"ended_at" timestamp,
	"end_reason" text,
	"exit_code" integer,
	"resource_class" text DEFAULT 'standard' NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_secrets"
	ADD CONSTRAINT "agent_secrets_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "agent_jobs"
	ADD CONSTRAINT "agent_jobs_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "agent_events"
	ADD CONSTRAINT "agent_events_job_id_agent_jobs_id_fk"
	FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "agent_events"
	ADD CONSTRAINT "agent_events_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "agent_artifacts"
	ADD CONSTRAINT "agent_artifacts_job_id_agent_jobs_id_fk"
	FOREIGN KEY ("job_id") REFERENCES "public"."agent_jobs"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "agent_artifacts"
	ADD CONSTRAINT "agent_artifacts_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "sandbox_sessions"
	ADD CONSTRAINT "sandbox_sessions_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_secrets_user_key_unique" ON "agent_secrets" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "agent_jobs_user_status_created_idx" ON "agent_jobs" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_jobs_pending_idx" ON "agent_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_events_job_created_idx" ON "agent_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_user_kind_created_idx" ON "agent_events" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "agent_artifacts_job_idx" ON "agent_artifacts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "sandbox_sessions_user_started_idx" ON "sandbox_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "sandbox_sessions_expires_active_idx" ON "sandbox_sessions" USING btree ("expires_at");--> statement-breakpoint

-- Worker uses this to atomically claim one queued row in a single round-trip.
-- SECURITY DEFINER + SET search_path is the standard Postgres hygiene.
CREATE OR REPLACE FUNCTION public.claim_one_agent_job(_runner_id text)
RETURNS public.agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	claimed public.agent_jobs;
BEGIN
	WITH candidate AS (
		SELECT id
		FROM public.agent_jobs
		WHERE status = 'queued'
		ORDER BY created_at
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	)
	UPDATE public.agent_jobs j
		SET status     = 'running',
				claimed_at = now(),
				runner_id  = _runner_id
		FROM candidate c
		WHERE j.id = c.id
		RETURNING j.* INTO claimed;
	RETURN claimed;
END $$;
