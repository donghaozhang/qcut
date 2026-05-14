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
	private env: Env;
	// Single-attachment guard. The DO id is derived from session_id, so any
	// request that reaches this DO targets the same session — a second tab
	// or a reconnect after a network blip would otherwise race the first
	// and the earlier disconnect would prematurely markEnded() the new one.
	private attached = false;

	constructor(_state: DurableObjectState, env: Env) {
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
			claims = await verifyToken({
				token,
				secret: this.env.RELAY_SIGNING_SECRET,
			});
		} catch {
			return new Response("invalid_token", { status: 401 });
		}

		const session = await fetchSession(this.env, claims.session_id);
		if (!session || session.status !== "active") {
			return new Response("session_not_active", { status: 410 });
		}

		if (this.attached) {
			return new Response("session_already_attached", { status: 409 });
		}
		this.attached = true;

		type SandboxHandle = Awaited<
			ReturnType<typeof import("e2b").Sandbox.connect>
		>;
		type PtyHandle = Awaited<ReturnType<SandboxHandle["pty"]["create"]>>;
		let sandbox: SandboxHandle | undefined;
		let pty: PtyHandle | undefined;
		let server: WebSocket | undefined;

		try {
			const e2b = await import("e2b");
			sandbox = await e2b.Sandbox.connect(session.provider_session_id, {
				apiKey: this.env.E2B_API_KEY,
			});

			const pair = new WebSocketPair();
			const client = pair[0];
			server = pair[1];
			server.accept();

			let bytesOut = 0;
			let lastAudit = Date.now();
			const serverRef = server;
			const sendBuf = (chunk: Uint8Array) => {
				try {
					serverRef.send(chunk);
				} catch {
					/* socket closed mid-send; ignore */
				}
			};

			pty = await sandbox.pty.create({
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
						"' && echo 'type: qcut --help for command reference'\n"
				)
			);
			void auditEvent(this.env, claims.session_id, "motd_sent", {});
			void auditEvent(this.env, claims.session_id, "pty_attached", {});

			const ptyHandle = pty;
			const sandboxHandle = sandbox;

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
								await sandboxHandle.pty.resize(ptyHandle.pid, {
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
						await sandboxHandle.pty.sendInput(ptyHandle.pid, buf);
					} catch {
						/* sandbox gone; ignore */
					}
				})();
			});

			server.addEventListener("close", () => {
				void (async () => {
					try {
						await sandboxHandle.pty.kill(ptyHandle.pid);
					} catch {
						/* already dead */
					}
					this.attached = false;
					await markEnded(this.env, claims.session_id, "disconnect");
				})();
			});

			return new Response(null, { status: 101, webSocket: client });
		} catch (err) {
			// Init failed before the close handler was wired up — clean up
			// the sandbox + DO state + DB row ourselves so the session row
			// doesn't stay pinned as `active` and the user can re-spawn.
			console.error("[pty-session] init failed:", err);
			this.attached = false;
			if (sandbox && pty) {
				try {
					await sandbox.pty.kill(pty.pid);
				} catch {
					/* best-effort */
				}
			}
			if (sandbox) {
				try {
					await sandbox.kill();
				} catch {
					/* best-effort */
				}
			}
			if (server) {
				try {
					server.close(1011, "init_failed");
				} catch {
					/* never accepted */
				}
			}
			try {
				await markEnded(this.env, claims.session_id, "error");
			} catch {
				/* audit best-effort */
			}
			return new Response("session_init_failed", { status: 502 });
		}
	}
}
