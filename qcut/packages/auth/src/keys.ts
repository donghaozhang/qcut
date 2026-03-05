import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
	createEnv({
		server: {
			BETTER_AUTH_SECRET: z.string().min(1),
			BETTER_AUTH_URL: z.string().url(),
			GOOGLE_CLIENT_ID: z.string().min(1),
			GOOGLE_CLIENT_SECRET: z.string().min(1),
			BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
		},
		client: {
			NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url(),
		},
		runtimeEnv: {
			NEXT_PUBLIC_BETTER_AUTH_URL:
				process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
			BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
			GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
			BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
		},
	});
