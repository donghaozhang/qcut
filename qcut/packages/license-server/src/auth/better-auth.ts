import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";

type Auth = ReturnType<typeof betterAuth>;

let _auth: Auth | null = null;

const WORKER_BASE_URL = "https://qcut-license-server.zdhpeter.workers.dev";

const TRUSTED_ORIGINS = [
	"https://quriosity.com.au",
	"https://www.quriosity.com.au",
	"https://donghaozhang.github.io",
	"http://localhost:3000",
	"http://localhost:5173",
];

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
		baseURL: WORKER_BASE_URL,
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
			},
		},
		trustedOrigins: TRUSTED_ORIGINS,
	});

	return _auth;
}
