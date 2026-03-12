import type { IncomingMessage } from "node:http";
import { parse } from "node:url";

const STRICT_LOCAL_AUTH_PATHS = new Set([
	"/api/claude/console",
	"/api/claude/console/stream",
	"/api/claude/errors",
]);

export interface ClaudeHttpAuthResult {
	ok: boolean;
	status?: number;
	error?: string;
}

export function authorizeClaudeHttpRequest({
	req,
}: {
	req: IncomingMessage;
}): ClaudeHttpAuthResult {
	const configuredToken = process.env.QCUT_API_TOKEN?.trim();
	const pathname = parse(req.url || "/", true).pathname || "/";
	const authorization = req.headers.authorization;

	if (STRICT_LOCAL_AUTH_PATHS.has(pathname) && !configuredToken) {
		return {
			ok: false,
			status: 403,
			error:
				"Console routes require QCUT_API_TOKEN to be configured and sent as a bearer token.",
		};
	}

	if (!configuredToken) {
		return { ok: true };
	}

	if (authorization === `Bearer ${configuredToken}`) {
		return { ok: true };
	}

	return {
		ok: false,
		status: 401,
		error: "Unauthorized",
	};
}
