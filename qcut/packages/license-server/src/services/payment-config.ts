const DEFAULT_CORS_ORIGINS = [
	"http://localhost:3000",
	"app://qcut",
	"https://quriosity.com.au",
	"https://www.quriosity.com.au",
	"https://donghaozhang.github.io",
];

const PAYMENT_WEB_BASE_URL = "https://quriosity.com.au";
const IDEMPOTENCY_TIME_BUCKET_MS = 5 * 60 * 1000;

/** Parses boolean env flags with a safe default. */
function parseBooleanEnv({
	value,
	defaultValue,
}: {
	value: string | undefined;
	defaultValue: boolean;
}): boolean {
	if (typeof value !== "string") {
		return defaultValue;
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") {
		return true;
	}
	if (normalized === "false") {
		return false;
	}
	return defaultValue;
}

/** Splits comma-delimited env values into trimmed entries. */
function parseCsv({ value }: { value: string | undefined }): string[] {
	if (typeof value !== "string") {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

/** Removes a trailing slash from configured base URLs. */
function normalizeBaseUrl({ value }: { value: string }): string {
	const trimmed = value.trim();
	if (trimmed.endsWith("/")) {
		return trimmed.slice(0, -1);
	}
	return trimmed;
}

/** Sanitizes idempotency-key fragments to Stripe-safe characters. */
function sanitizeKeyPart({ value }: { value: string }): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Builds a time-bucketed idempotency key when the caller did not supply one. */
function buildFallbackIdempotencyKey({
	scope,
	ownerId,
	payloadParts,
	nowMs,
}: {
	scope: string;
	ownerId: string;
	payloadParts: string[];
	nowMs?: number;
}): string {
	const bucket = Math.floor((nowMs ?? Date.now()) / IDEMPOTENCY_TIME_BUCKET_MS);
	const parts = ["qcut", scope, ownerId, ...payloadParts, String(bucket)].map(
		(part) => sanitizeKeyPart({ value: part })
	);
	return parts.join(":").slice(0, 255);
}

/** Returns the canonical web base URL for hosted payment redirects. */
export function getPaymentWebBaseUrl(): string {
	const configured = process.env.PAYMENTS_WEB_BASE_URL;
	if (typeof configured === "string" && configured.trim().length > 0) {
		return normalizeBaseUrl({ value: configured });
	}
	return PAYMENT_WEB_BASE_URL;
}

/** Builds the checkout success URL for the requested payment flow. */
export function getPaymentSuccessUrl({
	type,
}: {
	type: "subscription" | "topup";
}): string {
	const baseUrl = getPaymentWebBaseUrl();
	if (type === "topup") {
		return `${baseUrl}/account/success.html?session_id={CHECKOUT_SESSION_ID}&type=topup`;
	}
	return `${baseUrl}/account/success.html?session_id={CHECKOUT_SESSION_ID}`;
}

/** Builds the checkout cancel URL for the requested payment flow. */
export function getPaymentCancelUrl({
	type,
}: {
	type: "subscription" | "topup";
}): string {
	const baseUrl = getPaymentWebBaseUrl();
	if (type === "topup") {
		return `${baseUrl}/account/pricing.html#credits`;
	}
	return `${baseUrl}/account/pricing.html`;
}

/** Returns the billing-portal return target. */
export function getPaymentPortalReturnUrl(): string {
	const baseUrl = getPaymentWebBaseUrl();
	return `${baseUrl}/account/dashboard.html`;
}

/** Reports whether checkout session creation is enabled. */
export function isCheckoutCreationEnabled(): boolean {
	return parseBooleanEnv({
		value: process.env.PAYMENTS_CHECKOUT_ENABLED,
		defaultValue: true,
	});
}

/** Reports whether Stripe webhook processing is enabled. */
export function isWebhookProcessingEnabled(): boolean {
	return parseBooleanEnv({
		value: process.env.PAYMENTS_WEBHOOK_ENABLED,
		defaultValue: true,
	});
}

/** Reports whether payments are limited to the canary allowlist. */
export function isCanaryModeEnabled(): boolean {
	return parseBooleanEnv({
		value: process.env.PAYMENTS_CANARY_ONLY,
		defaultValue: false,
	});
}

/** Returns the normalized payment canary allowlist. */
export function getPaymentEmailAllowlist(): string[] {
	return parseCsv({ value: process.env.PAYMENTS_EMAIL_ALLOWLIST }).map(
		(email) => email.toLowerCase()
	);
}

/** Checks whether an email is permitted while canary mode is active. */
export function isEmailAllowedForCanary({
	email,
}: {
	email: string | null;
}): boolean {
	if (!isCanaryModeEnabled()) {
		return true;
	}
	if (typeof email !== "string" || email.trim().length === 0) {
		return false;
	}

	const allowlist = getPaymentEmailAllowlist();
	if (allowlist.length === 0) {
		return false;
	}
	return allowlist.includes(email.trim().toLowerCase());
}

/** Builds the de-duplicated CORS allowlist for payment endpoints. */
export function getAllowedCorsOrigins(): string[] {
	const configured = parseCsv({ value: process.env.CORS_ALLOWED_ORIGINS });
	const combined = [...DEFAULT_CORS_ORIGINS, ...configured];
	const seen = new Set<string>();
	for (const origin of combined) {
		if (seen.has(origin)) {
			continue;
		}
		seen.add(origin);
	}
	return [...seen];
}

/** Prefers a caller-supplied idempotency key and falls back to a generated one. */
export function resolveStripeIdempotencyKey({
	providedKey,
	scope,
	ownerId,
	payloadParts,
	nowMs,
}: {
	providedKey?: string;
	scope: string;
	ownerId: string;
	payloadParts: string[];
	nowMs?: number;
}): string {
	if (typeof providedKey === "string" && providedKey.trim().length > 0) {
		return providedKey.trim().slice(0, 255);
	}
	return buildFallbackIdempotencyKey({
		scope,
		ownerId,
		payloadParts,
		nowMs,
	});
}
