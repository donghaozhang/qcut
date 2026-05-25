/**
 * @qcut/relay — Cloudflare Worker that bridges the browser xterm.js
 * WebSocket to an E2B sandbox PTY. Each session lives in a Durable
 * Object keyed by the session_id from the spawn token.
 *
 * Routes:
 *   GET /pty?token=<jwt>   — Upgrade: websocket
 *
 * @module @qcut/relay/index
 */

export { PtySession } from "./pty-session.js";
import { peekSessionId } from "./verify-token.js";

export interface Env {
	PTY: DurableObjectNamespace;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	RELAY_SIGNING_SECRET: string;
	E2B_API_KEY: string;
	DAYTONA_API_KEY: string;
	OPENAI_API_KEY?: string;
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname !== "/pty") {
			return new Response("not_found", { status: 404 });
		}
		const token = url.searchParams.get("token");
		if (!token) return new Response("missing_token", { status: 400 });

		// Peek without verifying — just to route to the right DO. The DO
		// re-verifies with the real shared secret.
		const sessionId = peekSessionId(token);
		if (!sessionId) return new Response("bad_token", { status: 400 });

		const id = env.PTY.idFromName(sessionId);
		const stub = env.PTY.get(id);
		return stub.fetch(req);
	},
};
