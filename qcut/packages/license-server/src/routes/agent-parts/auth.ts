import type { Context, Next } from "hono";

import { authMiddleware } from "../../middleware/auth";
import { getDefaultAgentUserId, isDefaultAgentUserAllowed } from "./constants";

export async function agentAuthMiddleware(c: Context, next: Next) {
	const defaultUserId = getDefaultAgentUserId();
	const authHeader = c.req.header("Authorization") || "";
	if (
		authHeader.length === 0 &&
		defaultUserId.length > 0 &&
		isDefaultAgentUserAllowed()
	) {
		console.warn(
			"[agent] authenticating unauthenticated request as the default user; QCUT_AGENT_ALLOW_DEFAULT_USER is enabled"
		);
		c.set("userId", defaultUserId);
		await next();
		return;
	}
	return authMiddleware(c, next);
}
