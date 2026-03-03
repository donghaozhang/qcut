import { and, eq, gte } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db } from "@qcut/db";
import { sessions } from "@qcut/db/schema";
import { isMockMode } from "./mock";

function extractBearerToken({ authHeader }: { authHeader?: string }): string {
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return "";
	}
	return authHeader.slice("Bearer ".length).trim();
}

function tryDecodeJwtUserId({ token }: { token: string }): string | null {
	try {
		const tokenParts = token.split(".");
		if (tokenParts.length !== 3) {
			return null;
		}

		const base64 = tokenParts[1]
			.replace(/-/g, "+")
			.replace(/_/g, "/")
			.padEnd(Math.ceil(tokenParts[1].length / 4) * 4, "=");
		const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
		const payloadRaw =
			typeof atobFn === "function"
				? atobFn(base64)
				: Buffer.from(base64, "base64").toString("utf-8");
		const payload = JSON.parse(payloadRaw) as {
			sub?: unknown;
			userId?: unknown;
		};
		if (typeof payload.sub === "string") {
			return payload.sub;
		}
		if (typeof payload.userId === "string") {
			return payload.userId;
		}
		return null;
	} catch {
		return null;
	}
}

export async function authMiddleware(c: Context, next: Next) {
	// Mock mode: skip real auth, use mock user ID
	if (isMockMode()) {
		c.set("userId", "mock-user-001");
		await next();
		return;
	}

	const token = extractBearerToken({
		authHeader: c.req.header("Authorization"),
	});
	if (token.length === 0) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const [session] = await db
			.select({ userId: sessions.userId })
			.from(sessions)
			.where(
				and(eq(sessions.token, token), gte(sessions.expiresAt, new Date()))
			)
			.limit(1);

		if (session?.userId) {
			c.set("userId", session.userId);
			await next();
			return;
		}

		const fallbackUserId = tryDecodeJwtUserId({ token });
		if (fallbackUserId) {
			c.set("userId", fallbackUserId);
			await next();
			return;
		}

		return c.json({ error: "Invalid token" }, 401);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Auth middleware failed: ${error.message}`
						: "Auth middleware failed",
			},
			500
		);
	}
}
