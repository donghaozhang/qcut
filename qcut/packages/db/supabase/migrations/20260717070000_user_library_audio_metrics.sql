-- Backfill: drizzle migrations 0007-0009 (review shares, user library,
-- device-activation uniqueness, audio download metrics).

CREATE TABLE "review_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"package" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "review_shares_token_hash_unique" UNIQUE("token_hash")
);

ALTER TABLE "review_shares" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "user_library_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"namespace" text NOT NULL,
	"document_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

ALTER TABLE "user_library_documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "review_shares" ADD CONSTRAINT "review_shares_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "user_library_documents" ADD CONSTRAINT "user_library_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "review_shares_owner_project_idx" ON "review_shares" USING btree ("owner_user_id", "project_id");
CREATE INDEX "review_shares_token_status_idx" ON "review_shares" USING btree ("token_hash", "status");
CREATE UNIQUE INDEX "user_library_documents_user_namespace_key_unique" ON "user_library_documents" USING btree ("user_id", "namespace", "document_key");
CREATE INDEX "user_library_documents_user_namespace_idx" ON "user_library_documents" USING btree ("user_id", "namespace");

-- Drizzle 0008: enforce one activation row per license/device.
DELETE FROM "device_activations" AS stale
USING "device_activations" AS keeper
WHERE stale."license_id" = keeper."license_id"
	AND stale."device_fingerprint" = keeper."device_fingerprint"
	AND (
		stale."last_seen_at" < keeper."last_seen_at"
		OR (
			stale."last_seen_at" = keeper."last_seen_at"
			AND stale."id" < keeper."id"
		)
	);
CREATE UNIQUE INDEX IF NOT EXISTS "device_activations_license_fingerprint_unique" ON "device_activations" USING btree ("license_id","device_fingerprint");

-- Drizzle 0009: audio download metrics.
CREATE TABLE "audio_track_downloads" (
	"track_key" text PRIMARY KEY NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL
);

ALTER TABLE "audio_track_downloads" ENABLE ROW LEVEL SECURITY;
