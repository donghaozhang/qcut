import { and, eq, gte } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db } from "@qcut/db";
import { sessions } from "@qcut/db/schema";
import { isMockMode } from "./mock";
import { verifyJwtAndExtractUserId } from "./auth-jwt";

function extractBearerToken({ authHeader }: { authHeader?: string }): string {
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return "";
	}
	return authHeader.slice("Bearer ".length).trim();
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

			const fallbackUserId = await verifyJwtAndExtractUserId({
				token,
				secret: process.env.BETTER_AUTH_SECRET || "",
			});
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
