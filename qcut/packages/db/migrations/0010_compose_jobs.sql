CREATE TABLE "compose_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compose_jobs_status_check" CHECK ("compose_jobs"."status" IN ('queued', 'running', 'completed', 'failed', 'canceled'))
);

--> statement-breakpoint
ALTER TABLE "compose_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "compose_jobs" ADD CONSTRAINT "compose_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "compose_jobs_queue_idx" ON "compose_jobs" USING btree ("status","lease_expires_at","created_at");
--> statement-breakpoint
CREATE INDEX "compose_jobs_owner_idx" ON "compose_jobs" USING btree ("user_id","created_at");
