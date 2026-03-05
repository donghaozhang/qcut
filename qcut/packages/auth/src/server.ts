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

function parseTrustedOrigins({
	value,
}: {
	value?: string;
}): string[] {
	try {
		if (typeof value !== "string") {
			return [];
		}

		return value
			.split(",")
			.map((origin) => origin.trim())
			.filter((origin) => origin.length > 0);
	} catch {
		return [];
	}
}

const DEFAULT_TRUSTED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:4173",
	"http://localhost:5173",
	"https://quriosity.com.au",
	"https://www.quriosity.com.au",
	"https://donghaozhang.github.io",
];

const configuredTrustedOrigins = parseTrustedOrigins({
	value: BETTER_AUTH_TRUSTED_ORIGINS,
});

const trustedOrigins = [...new Set([...DEFAULT_TRUSTED_ORIGINS, ...configuredTrustedOrigins])];

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
