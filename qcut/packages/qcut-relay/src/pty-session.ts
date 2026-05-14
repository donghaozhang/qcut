/**
 * Durable Object holding one live PTY session pair (browser WS ↔ E2B
 * PTY). One DO per session_id; idFromName(session_id) gives us global
 * routing.
 *
 * The DO verifies the relay token *itself* (the top-level fetch only
 * peeks). It then opens a PTY in the named E2B sandbox, pipes bytes
 * both ways, samples a row into agent_events every 5 s or 8 KB out,
 * and PATCHes sandbox_sessions when the connection drops.
 *
 * @module @qcut/relay/pty-session
 */

import { auditEvent, fetchSession, markEnded } from "./audit.js";
import { verifyToken } from "./verify-token.js";
import type { Env } from "./index.js";

interface PtyHandle {
	write(data: Uint8Array): void;
	resize(opts: { cols: number; rows: number }): void;
	onData(cb: (b: Uint8Array) => void): void;
	kill(): Promise<void> | void;
}

export class PtySession {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(req: Request): Promise<Response> {
		if (req.headers.get("Upgrade") !== "websocket") {
			return new Response("expected_ws", { status: 400 });
		}

		const token = new URL(req.url).searchParams.get("token");
		if (!token) return new Response("missing_token", { status: 400 });

		let claims: { session_id: string };
		try {
			claims = await verifyToken(token, this.env.RELAY_SIGNING_SECRET);
		} catch {
			return new Response("invalid_token", { status: 401 });
		}

		const session = await fetchSession(this.env, claims.session_id);
		if (!session || session.status !== "active") {
			return new Response("session_not_active", { status: 410 });
		}

		// Lazy import — keep the E2B SDK out of the cold-start path until
		// we actually need it. Cloudflare Workers honour dynamic imports.
		const e2b = await import("e2b");
		const sandbox = await e2b.Sandbox.connect(session.provider_session_id, {
			apiKey: this.env.E2B_API_KEY,
		});
		const pty = (await (sandbox as { pty: { create: (opts: unknown) => Promise<PtyHandle> } }).pty.create({
			rows: 24,
			cols: 80,
			command: "/usr/local/bin/qcut-entrypoint bash",
		})) as PtyHandle;

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();

		let bytesOut = 0;
		let lastAudit = Date.now();

		pty.onData((chunk: Uint8Array) => {
			bytesOut += chunk.byteLength;
			server.send(chunk);
			if (Date.now() - lastAudit > 5000 || bytesOut > 8192) {
				const sample = bytesOut;
				bytesOut = 0;
				lastAudit = Date.now();
				void auditEvent(this.env, claims.session_id, "sandbox_io", {
					direction: "out",
					bytes: sample,
				});
			}
		});

		// motd + lifecycle markers
		const motd =
			`qcut sandbox · session ${claims.session_id.slice(0, 8)} · expires ${session.expires_at}\r\n` +
			"type 'qcut system doctor' to verify provider reachability\r\n";
		server.send(new TextEncoder().encode(motd));
		void auditEvent(this.env, claims.session_id, "motd_sent", {});
		void auditEvent(this.env, claims.session_id, "pty_attached", {});

		server.addEventListener("message", (ev: MessageEvent) => {
			const data = ev.data;
			if (typeof data === "string") {
				// Control frames as JSON envelopes
				try {
					const ctrl = JSON.parse(data);
					if (
						ctrl &&
						ctrl.kind === "resize" &&
						typeof ctrl.rows === "number" &&
						typeof ctrl.cols === "number"
					) {
						pty.resize({ rows: ctrl.rows, cols: ctrl.cols });
					}
				} catch {
					/* drop malformed */
				}
				return;
			}
			const buf = new Uint8Array(data as ArrayBuffer);
			pty.write(buf);
		});

		server.addEventListener("close", () => {
			void (async () => {
				try {
					await pty.kill();
				} catch {
					/* ignore */
				}
				await markEnded(this.env, claims.session_id, "disconnect");
			})();
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
