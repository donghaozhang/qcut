import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
}).enableRLS();

export const accounts = pgTable(
	"accounts",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
	},
	(table) => [
		uniqueIndex("accounts_provider_account_unique").on(
			table.providerId,
			table.accountId
		),
	]
).enableRLS();

export const verifications = pgTable("verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").$defaultFn(
		() => /* @__PURE__ */ new Date()
	),
	updatedAt: timestamp("updated_at").$defaultFn(
		() => /* @__PURE__ */ new Date()
	),
}).enableRLS();

export const waitlist = pgTable("waitlist", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

// --- Payment & License tables ---

export const licenses = pgTable("licenses", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" })
		.unique(),
	plan: text("plan", { enum: ["free", "pro", "team"] })
		.notNull()
		.default("free"),
	status: text("status", {
		enum: ["active", "past_due", "cancelled", "expired"],
	})
		.notNull()
		.default("active"),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	currentPeriodEnd: timestamp("current_period_end"),
	maxDevices: integer("max_devices").notNull().default(1),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const deviceActivations = pgTable("device_activations", {
	id: text("id").primaryKey(),
	licenseId: text("license_id")
		.notNull()
		.references(() => licenses.id, { onDelete: "cascade" }),
	deviceFingerprint: text("device_fingerprint").notNull(),
	deviceName: text("device_name").notNull(),
	lastSeenAt: timestamp("last_seen_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	isActive: boolean("is_active").notNull().default(true),
}).enableRLS();

export const creditBalances = pgTable("credit_balances", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" })
		.unique(),
	planCredits: numeric("plan_credits", {
		precision: 12,
		scale: 3,
		mode: "number",
	})
		.notNull()
		.default(50),
	topUpCredits: numeric("top_up_credits", {
		precision: 12,
		scale: 3,
		mode: "number",
	})
		.notNull()
		.default(0),
	planCreditsResetAt: timestamp("plan_credits_reset_at").notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const creditTransactions = pgTable("credit_transactions", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	type: text("type", {
		enum: ["plan_grant", "top_up", "deduction", "refund", "expiry"],
	}).notNull(),
	amount: numeric("amount", {
		precision: 12,
		scale: 3,
		mode: "number",
	}).notNull(),
	balanceAfter: numeric("balance_after", {
		precision: 12,
		scale: 3,
		mode: "number",
	}).notNull(),
	description: text("description"),
	modelKey: text("model_key"),
	stripePaymentId: text("stripe_payment_id"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
	id: text("id").primaryKey(),
	eventId: text("event_id").notNull().unique(),
	eventType: text("event_type").notNull(),
	processedAt: timestamp("processed_at"),
	lastError: text("last_error"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const usageRecords = pgTable("usage_records", {
	id: text("id").primaryKey(),
	licenseId: text("license_id")
		.notNull()
		.references(() => licenses.id, { onDelete: "cascade" }),
	type: text("type", { enum: ["ai_generation", "export", "render"] }).notNull(),
	count: integer("count").notNull().default(1),
	periodStart: timestamp("period_start").notNull(),
	periodEnd: timestamp("period_end").notNull(),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

// --- Agent path (headless CLI) + Sandbox (interactive browser shell) ---
//
// One source of truth: Drizzle on the same Postgres the license-server
// reaches via Hyperdrive. v0 has no per-workspace concept — keys are
// strictly per-user. Plan-tier or future team accounts can layer on
// top later without touching this schema.

/** Per-user provider API keys (FAL/Gemini/OpenAI/…). Materialized into
 * the container's ~/.qcut/.env at spawn time. v0 stores plaintext;
 * pgsodium-managed values are a follow-up once key rotation is
 * concrete. */
export const agentSecrets = pgTable(
	"agent_secrets",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: text("value").notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => ({
		userKey: uniqueIndex("agent_secrets_user_key_unique").on(t.userId, t.key),
	})
).enableRLS();

/** Persistent headless Daytona sandbox sessions for website Codex chat.
 * Jobs may attach to one of these so follow-up prompts reuse the same
 * filesystem/tool cache until TTL or idle cleanup ends the sandbox. */
export const agentSessions = pgTable(
	"agent_sessions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["active", "stopping", "ended", "error"],
		}).notNull(),
		provider: text("provider", { enum: ["daytona"] })
			.notNull()
			.default("daytona"),
		providerSessionId: text("provider_session_id"),
		imageTag: text("image_tag").notNull(),
		startedAt: timestamp("started_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		lastActiveAt: timestamp("last_active_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		endedAt: timestamp("ended_at"),
		endReason: text("end_reason", {
			enum: ["idle_timeout", "ttl", "error", "user_kill"],
		}),
		runnerId: text("runner_id"),
	},
	(t) => ({
		userStatusActive: index("agent_sessions_user_status_last_active_idx").on(
			t.userId,
			t.status,
			t.lastActiveAt
		),
		expiresActive: index("agent_sessions_expires_active_idx").on(t.expiresAt),
	})
).enableRLS();

/** Queued / running / terminal headless jobs. Worker claims via a
 * `claim_one_agent_job` Postgres function (defined in the generated
 * migration alongside this table). */
export const agentJobs = pgTable(
	"agent_jobs",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => agentSessions.id, {
			onDelete: "set null",
		}),
		status: text("status", {
			enum: ["queued", "running", "succeeded", "failed", "cancelled"],
		}).notNull(),
		command: text("command").notNull(),
		args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		claimedAt: timestamp("claimed_at"),
		finishedAt: timestamp("finished_at"),
		exitCode: integer("exit_code"),
		error: text("error"),
		runnerId: text("runner_id"),
	},
	(t) => ({
		userStatusCreated: index("agent_jobs_user_status_created_idx").on(
			t.userId,
			t.status,
			t.createdAt
		),
		// Partial index sized for the claim_one_agent_job hot path
		// (WHERE status='queued' ORDER BY created_at). Covering both the
		// filter and the sort column eliminates the runtime sort that a
		// plain index on `status` alone would need.
		queueCreated: index("agent_jobs_queued_created_idx")
			.on(t.createdAt)
			.where(sql`${t.status} = 'queued'`),
		sessionCreated: index("agent_jobs_session_created_idx").on(
			t.sessionId,
			t.createdAt
		),
	})
).enableRLS();

/** Telemetry stream — CLI stderr JSONL + relay-side audit. */
export const agentEvents = pgTable(
	"agent_events",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		jobId: text("job_id").references(() => agentJobs.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		kind: text("kind").notNull(),
		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => ({
		jobCreated: index("agent_events_job_created_idx").on(t.jobId, t.createdAt),
		userKindCreated: index("agent_events_user_kind_created_idx").on(
			t.userId,
			t.kind,
			t.createdAt
		),
	})
).enableRLS();

/** Output files produced by a job (image/video/audio/json/log). The
 * `storage_path` points into Supabase Storage (kept cross-stack for v0
 * since the license-server has no storage primitive — R2 migration is
 * a follow-up). */
export const agentArtifacts = pgTable(
	"agent_artifacts",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => agentJobs.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind", {
			enum: ["image", "video", "audio", "json", "log"],
		}).notNull(),
		storagePath: text("storage_path").notNull(),
		// bigint mode: "number" keeps the TS type as `number | null`
		// (safe for sizes up to Number.MAX_SAFE_INTEGER ≈ 9 PB), while
		// the underlying column is Postgres bigint so a multi-GB video
		// artifact won't overflow int4's ~2.1 GB ceiling.
		bytes: bigint("bytes", { mode: "number" }),
		meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
		createdAt: timestamp("created_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => ({
		job: index("agent_artifacts_job_idx").on(t.jobId),
	})
).enableRLS();

/** Interactive browser-terminal sessions (Phase 2). */
export const sandboxSessions = pgTable(
	"sandbox_sessions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["spawning", "active", "stopping", "ended"],
		}).notNull(),
		provider: text("provider", { enum: ["e2b", "daytona"] }).notNull(),
		providerSessionId: text("provider_session_id").notNull(),
		imageTag: text("image_tag").notNull(),
		startedAt: timestamp("started_at")
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		lastInputAt: timestamp("last_input_at"),
		endedAt: timestamp("ended_at"),
		endReason: text("end_reason", {
			enum: ["disconnect", "idle_timeout", "ttl", "error", "user_kill"],
		}),
		exitCode: integer("exit_code"),
		resourceClass: text("resource_class", { enum: ["standard", "large"] })
			.notNull()
			.default("standard"),
		expiresAt: timestamp("expires_at").notNull(),
	},
	(t) => ({
		userStartedDesc: index("sandbox_sessions_user_started_idx").on(
			t.userId,
			t.startedAt
		),
		expiresActive: index("sandbox_sessions_expires_active_idx").on(t.expiresAt),
	})
).enableRLS();

// --- Inferred types (consumers should import from @qcut/db) ---

export type AgentSecret = typeof agentSecrets.$inferSelect;
export type NewAgentSecret = typeof agentSecrets.$inferInsert;

export type AgentSession = typeof agentSessions.$inferSelect;
export type NewAgentSession = typeof agentSessions.$inferInsert;
export type AgentSessionStatus = AgentSession["status"];
export type AgentSessionEndReason = NonNullable<AgentSession["endReason"]>;

export type AgentJob = typeof agentJobs.$inferSelect;
export type NewAgentJob = typeof agentJobs.$inferInsert;
export type AgentJobStatus = AgentJob["status"];

export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;

export type AgentArtifact = typeof agentArtifacts.$inferSelect;
export type NewAgentArtifact = typeof agentArtifacts.$inferInsert;
export type AgentArtifactKind = AgentArtifact["kind"];

export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
export type SandboxStatus = SandboxSession["status"];
export type SandboxProvider = SandboxSession["provider"];
export type SandboxEndReason = NonNullable<SandboxSession["endReason"]>;
export type SandboxResourceClass = SandboxSession["resourceClass"];
