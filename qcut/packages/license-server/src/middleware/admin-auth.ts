import type { Context, Next } from "hono";

/**
 * Validates requests against the ADMIN_API_KEY environment variable.
 * Expects the key in the `x-admin-key` header.
 */
export async function adminAuthMiddleware(c: Context, next: Next) {
	const adminKey = process.env.ADMIN_API_KEY;
	if (!adminKey || adminKey.length === 0) {
		return c.json({ error: "Admin API not configured" }, 503);
	}

	const provided = c.req.header("x-admin-key")?.trim() ?? "";
	if (provided.length === 0 || provided !== adminKey) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	await next();
}
