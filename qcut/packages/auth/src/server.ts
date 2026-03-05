import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@qcut/db";
import { keys } from "./keys";

const {
	BETTER_AUTH_URL,
	BETTER_AUTH_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET,
	BETTER_AUTH_TRUSTED_ORIGINS,
} = keys();

function parseTrustedOrigins({ value }: { value?: string }): string[] {
	if (typeof value !== "string") {
		return [];
	}

	const origins: string[] = [];
	for (const entry of value.split(",")) {
		const candidate = entry.trim();
		if (candidate.length === 0) {
			continue;
		}
		try {
			origins.push(new URL(candidate).origin);
		} catch {
			throw new Error(
				`Invalid BETTER_AUTH_TRUSTED_ORIGINS entry: ${candidate}`
			);
		}
	}
	return origins;
}

const PROD_TRUSTED_ORIGINS = [
	"https://quriosity.com.au",
	"https://www.quriosity.com.au",
	"https://donghaozhang.github.io",
];

const LOCALHOST_TRUSTED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:4173",
	"http://localhost:5173",
];

const DEFAULT_TRUSTED_ORIGINS =
	process.env.NODE_ENV === "production"
		? PROD_TRUSTED_ORIGINS
		: [...PROD_TRUSTED_ORIGINS, ...LOCALHOST_TRUSTED_ORIGINS];

const configuredTrustedOrigins = parseTrustedOrigins({
	value: BETTER_AUTH_TRUSTED_ORIGINS,
});

const trustedOrigins = [
	...new Set([...DEFAULT_TRUSTED_ORIGINS, ...configuredTrustedOrigins]),
];

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
	}),
	secret: BETTER_AUTH_SECRET,
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
			clientId: GOOGLE_CLIENT_ID,
			clientSecret: GOOGLE_CLIENT_SECRET,
		},
	},
	baseURL: BETTER_AUTH_URL,
	appName: "QCut",
	trustedOrigins,
});

export type Auth = typeof auth;
