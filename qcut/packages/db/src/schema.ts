import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	numeric,
	uniqueIndex,
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
