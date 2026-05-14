/**
 * Durable Object holding one live PTY session pair (browser WS ↔ E2B
 * PTY). One DO per session_id; idFromName(session_id) gives global
 * routing.
 *
 * E2B SDK v2 PTY contract:
 *   - sandbox.pty.create({ cols, rows, onData, timeoutMs }) → CommandHandle
 *     (has .pid)
 *   - sandbox.pty.sendInput(pid, Uint8Array) → write bytes to stdin
 *   - sandbox.pty.resize(pid, { cols, rows })
 *   - sandbox.pty.kill(pid)
 *
 * onData is registered at create time, not on the handle.
 *
 * @module @qcut/relay/pty-session
 */

import { auditEvent, fetchSession, markEnded } from "./audit.js";
import { verifyToken } from "./verify-token.js";
import type { Env } from "./index.js";

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

		const e2b = await import("e2b");
		const sandbox = await e2b.Sandbox.connect(session.provider_session_id, {
			apiKey: this.env.E2B_API_KEY,
		});

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		server.accept();

		let bytesOut = 0;
		let lastAudit = Date.now();
		const sendBuf = (chunk: Uint8Array) => {
			try {
				server.send(chunk);
			} catch {
				/* socket closed mid-send; ignore */
			}
		};

		const pty = await sandbox.pty.create({
			cols: 80,
			rows: 24,
			timeoutMs: 30 * 60 * 1000,
			onData: (chunk: Uint8Array) => {
				bytesOut += chunk.byteLength;
				sendBuf(chunk);
				if (Date.now() - lastAudit > 5000 || bytesOut > 8192) {
					const sample = bytesOut;
					bytesOut = 0;
					lastAudit = Date.now();
					void auditEvent(this.env, claims.session_id, "sandbox_io", {
						direction: "out",
						bytes: sample,
					});
				}
			},
		});

		// Materialize ~/.qcut/.env from the env vars injected at spawn,
		// then a friendly motd. Drops the user straight at the bash prompt
		// (which is what E2B's pty.create gives them by default).
		await sandbox.pty.sendInput(
			pty.pid,
			new TextEncoder().encode(
				"/usr/local/bin/qcut-entrypoint /bin/true && clear && echo 'qcut sandbox · session " +
					claims.session_id.slice(0, 8) +
					" · expires " +
					session.expires_at +
					"' && echo 'type: qcut --help for command reference'\n",
			),
		);
		void auditEvent(this.env, claims.session_id, "motd_sent", {});
		void auditEvent(this.env, claims.session_id, "pty_attached", {});

		server.addEventListener("message", (ev: MessageEvent) => {
			void (async () => {
				const data = ev.data;
				if (typeof data === "string") {
					try {
						const ctrl = JSON.parse(data);
						if (
							ctrl &&
							ctrl.kind === "resize" &&
							typeof ctrl.rows === "number" &&
							typeof ctrl.cols === "number"
						) {
							await sandbox.pty.resize(pty.pid, {
								cols: ctrl.cols,
								rows: ctrl.rows,
							});
						}
					} catch {
						/* drop malformed control */
					}
					return;
				}
				try {
					const buf = new Uint8Array(data as ArrayBuffer);
					await sandbox.pty.sendInput(pty.pid, buf);
				} catch {
					/* sandbox gone; ignore */
				}
			})();
		});

		server.addEventListener("close", () => {
			void (async () => {
				try {
					await sandbox.pty.kill(pty.pid);
				} catch {
					/* already dead */
				}
				await markEnded(this.env, claims.session_id, "disconnect");
			})();
		});

		return new Response(null, { status: 101, webSocket: client });
	}
}
