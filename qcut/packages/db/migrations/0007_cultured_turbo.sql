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
--> statement-breakpoint
ALTER TABLE "review_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "user_library_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_shares" ADD CONSTRAINT "review_shares_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_library_documents" ADD CONSTRAINT "user_library_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "review_shares_owner_project_idx" ON "review_shares" USING btree ("owner_user_id", "project_id");
--> statement-breakpoint
CREATE INDEX "review_shares_token_status_idx" ON "review_shares" USING btree ("token_hash", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_library_documents_user_namespace_key_unique" ON "user_library_documents" USING btree ("user_id", "namespace", "document_key");
--> statement-breakpoint
CREATE INDEX "user_library_documents_user_namespace_idx" ON "user_library_documents" USING btree ("user_id", "namespace");
