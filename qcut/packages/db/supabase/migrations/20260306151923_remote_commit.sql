CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
;
ALTER TABLE "verifications" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
;
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;CREATE TABLE "licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp,
	"max_devices" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
;
ALTER TABLE "licenses" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "device_activations" (
	"id" text PRIMARY KEY NOT NULL,
	"license_id" text NOT NULL,
	"device_fingerprint" text NOT NULL,
	"device_name" text NOT NULL,
	"last_seen_at" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
;
ALTER TABLE "device_activations" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "credit_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_credits" integer DEFAULT 50 NOT NULL,
	"top_up_credits" integer DEFAULT 0 NOT NULL,
	"plan_credits_reset_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "credit_balances_user_id_unique" UNIQUE("user_id")
);
;
ALTER TABLE "credit_balances" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text,
	"model_key" text,
	"stripe_payment_id" text,
	"created_at" timestamp NOT NULL
);
;
ALTER TABLE "credit_transactions" ENABLE ROW LEVEL SECURITY;;
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"license_id" text NOT NULL,
	"type" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
;
ALTER TABLE "usage_records" ENABLE ROW LEVEL SECURITY;;
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "credit_balances" ALTER COLUMN "plan_credits" TYPE numeric(12,3) USING "plan_credits"::numeric;;
ALTER TABLE "credit_balances" ALTER COLUMN "top_up_credits" TYPE numeric(12,3) USING "top_up_credits"::numeric;;
ALTER TABLE "credit_transactions" ALTER COLUMN "amount" TYPE numeric(12,3) USING "amount"::numeric;;
ALTER TABLE "credit_transactions" ALTER COLUMN "balance_after" TYPE numeric(12,3) USING "balance_after"::numeric;;
CREATE TABLE "stripe_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp,
	"last_error" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "stripe_webhook_events_event_id_unique" UNIQUE("event_id")
);;
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS "licenses_user_id_unique" ON "licenses" ("user_id");;

-- RLS policies: all tables accessed via service_role from Cloudflare Worker
CREATE POLICY "service_role_all" ON "accounts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "sessions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "users" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "verifications" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "waitlist" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "licenses" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "device_activations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "credit_balances" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "credit_transactions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "usage_records" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON "stripe_webhook_events" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Prevent duplicate device activation rows per license+fingerprint
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_license_fingerprint_unique" UNIQUE ("license_id", "device_fingerprint");
