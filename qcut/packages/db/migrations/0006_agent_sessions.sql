-- Persistent headless Daytona sessions for website Codex chat. Jobs can
-- attach to a session so follow-up prompts reuse the same sandbox until
-- TTL or idle cleanup ends it.
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'daytona' NOT NULL,
	"provider_session_id" text,
	"image_tag" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"last_active_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"end_reason" text,
	"runner_id" text
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_sessions"
	ADD CONSTRAINT "agent_sessions_user_id_users_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
	ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "session_id" text;
--> statement-breakpoint
ALTER TABLE "agent_jobs"
	ADD CONSTRAINT "agent_jobs_session_id_agent_sessions_id_fk"
	FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id")
	ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_sessions_user_status_last_active_idx"
	ON "agent_sessions" USING btree ("user_id","status","last_active_at");
--> statement-breakpoint
CREATE INDEX "agent_sessions_expires_active_idx"
	ON "agent_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "agent_jobs_session_created_idx"
	ON "agent_jobs" USING btree ("session_id","created_at");
