import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";

type Auth = ReturnType<typeof betterAuth>;

let _auth: Auth | null = null;

const DEFAULT_BASE_URL = "https://qcut-license-server.zdhpeter.workers.dev";
const DEFAULT_TRUSTED_ORIGINS = [
	"https://quriosity.com.au",
	"https://www.quriosity.com.au",
	"https://donghaozhang.github.io",
	"https://qcut-license-server.zdhpeter.workers.dev",
];

function getBaseUrl(): string {
	const env = process.env.BETTER_AUTH_URL;
	return env?.trim() || DEFAULT_BASE_URL;
}

function getTrustedOrigins(): string[] {
	const baseUrl = getBaseUrl();
	const env = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
	const origins = env?.trim()
		? env
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean)
		: [...DEFAULT_TRUSTED_ORIGINS];
	// Always include the server's own origin so OAuth callbacks are accepted.
	if (!origins.includes(baseUrl)) {
		origins.push(baseUrl);
	}
	return origins;
}

/** Lazily creates and caches the Better Auth instance. Reads env vars only on first call. */
export function getAuth(): Auth {
	if (_auth) {
		return _auth;
	}

	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error("BETTER_AUTH_SECRET is not configured");
	}

	const googleClientId = process.env.GOOGLE_CLIENT_ID;
	const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
	if (!googleClientId || !googleClientSecret) {
		throw new Error("Google OAuth credentials are not configured");
	}

	_auth = betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			usePlural: true,
		}),
		secret,
		baseURL: getBaseUrl(),
		appName: "QCut",
		user: {
			deleteUser: {
				enabled: true,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			google: {
				clientId: googleClientId,
				clientSecret: googleClientSecret,
				scope: [
					"openid",
					"email",
					"profile",
					"https://www.googleapis.com/auth/youtube",
				],
			},
		},
		trustedOrigins: getTrustedOrigins(),
	});

	return _auth;
}
