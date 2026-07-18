-- agent_secrets was created in prod out-of-band (drizzle push, see
-- drizzle migration 0004); this tracks it in supabase migrations and
-- converges environments that are missing it. Fully idempotent.

CREATE TABLE IF NOT EXISTS "agent_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

ALTER TABLE "agent_secrets" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'agent_secrets_user_id_users_id_fk'
	) THEN
		ALTER TABLE "agent_secrets"
			ADD CONSTRAINT "agent_secrets_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
			ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_secrets_user_key_unique"
	ON "agent_secrets" USING btree ("user_id", "key");
