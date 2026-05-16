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
import { Daytona } from "@daytona/sdk";

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

		let claims: { session_id: string; session_kind?: "agent" | "sandbox" };
		try {
			claims = await verifyToken({
				token,
				secret: this.env.RELAY_SIGNING_SECRET,
			});
		} catch {
			return new Response("invalid_token", { status: 401 });
		}

		const session = await fetchSession(
			this.env,
			claims.session_id,
			claims.session_kind
		);
		if (!session || session.status !== "active") {
			return new Response("session_not_active", { status: 410 });
		}

		if (this.attached) {
			return new Response("session_already_attached", { status: 409 });
		}
		this.attached = true;

		let server: WebSocket | undefined;
		let sendInput: ((data: Uint8Array | string) => Promise<void>) | undefined;
		let resize: ((cols: number, rows: number) => Promise<void>) | undefined;
		let closePty: (() => Promise<void>) | undefined;
		let closeSandbox: (() => Promise<void>) | undefined;

		try {
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

			const onData = (chunk: Uint8Array | string) => {
				const bytes =
					typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
				bytesOut += bytes.byteLength;
				sendBuf(bytes);
				if (Date.now() - lastAudit > 5000 || bytesOut > 8192) {
					const sample = bytesOut;
					bytesOut = 0;
					lastAudit = Date.now();
					void auditEvent(this.env, claims.session_id, "sandbox_io", {
						direction: "out",
						bytes: sample,
						provider: session.provider,
					});
				}
			};

			if (session.provider === "daytona") {
				const daytona = new Daytona({ apiKey: this.env.DAYTONA_API_KEY });
				const sandbox = await daytona.get(session.provider_session_id);
				const pty = await sandbox.process.createPty({
					id: `qcut-agent-${claims.session_id.slice(0, 12)}`,
					cols: 100,
					rows: 30,
					cwd: "/home/qcut/qcut",
					onData,
				});
				sendInput = (data: Uint8Array | string) => pty.sendInput(data);
				resize = async (cols: number, rows: number) => {
					await pty.resize(cols, rows);
				};
				closePty = () => pty.kill();
				closeSandbox = () => Promise.resolve();
			} else {
				const e2b = await import("e2b");
				const sandbox = await e2b.Sandbox.connect(session.provider_session_id, {
					apiKey: this.env.E2B_API_KEY,
				});
				const pty = await sandbox.pty.create({
					cols: 80,
					rows: 24,
					timeoutMs: 30 * 60 * 1000,
					onData,
				});
				sendInput = (data: Uint8Array | string) =>
					sandbox.pty.sendInput(
						pty.pid,
						typeof data === "string" ? new TextEncoder().encode(data) : data
					);
				resize = async (cols: number, rows: number) => {
					await sandbox.pty.resize(pty.pid, { cols, rows });
				};
				closePty = async () => {
					await sandbox.pty.kill(pty.pid);
				};
				closeSandbox = async () => {
					await sandbox.kill();
				};
			}

			// Materialize ~/.qcut/.env from the env vars injected at spawn,
			// then a friendly motd. Both providers drop us at a shell.
			await sendInput(
				new TextEncoder().encode(
					"/usr/local/bin/qcut-entrypoint /bin/true && clear && echo 'qcut terminal · session " +
						claims.session_id.slice(0, 8) +
						" · provider " +
						session.provider +
						" · expires " +
						session.expires_at +
						"' && echo 'type: qcut --help or run codex from here' && cd /home/qcut/qcut 2>/dev/null || true\n"
				)
			);
			void auditEvent(this.env, claims.session_id, "motd_sent", {});
			void auditEvent(this.env, claims.session_id, "pty_attached", {
				provider: session.provider,
				sessionType: session.type,
			});

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
								await resize?.(ctrl.cols, ctrl.rows);
								return;
							}
						} catch {
							await sendInput?.(data);
						}
						return;
					}
					try {
						const buf = new Uint8Array(data as ArrayBuffer);
						await sendInput?.(buf);
					} catch {
						/* sandbox gone; ignore */
					}
				})();
			});

			server.addEventListener("close", () => {
				void (async () => {
					try {
						await closePty?.();
					} catch {
						/* already dead */
					}
					this.attached = false;
					if (session.type === "sandbox") {
						await markEnded(this.env, claims.session_id, "disconnect");
						return;
					}
					await auditEvent(this.env, claims.session_id, "pty_detached", {
						provider: session.provider,
					});
				})();
			});

			return new Response(null, { status: 101, webSocket: client });
		} catch (err) {
			// Init failed before the close handler was wired up — clean up
			// the sandbox + DO state + DB row ourselves so the session row
			// doesn't stay pinned as `active` and the user can re-spawn.
			console.error("[pty-session] init failed:", err);
			this.attached = false;
			try {
				await closePty?.();
			} catch {
				/* best-effort */
			}
			try {
				await closeSandbox?.();
			} catch {
				/* best-effort */
			}
			if (server) {
				try {
					server.close(1011, "init_failed");
				} catch {
					/* never accepted */
				}
			}
			try {
				if (session.type === "sandbox") {
					await markEnded(this.env, claims.session_id, "error");
				} else {
					await auditEvent(this.env, claims.session_id, "pty_error", {
						provider: session.provider,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			} catch {
				/* audit best-effort */
			}
			return new Response("session_init_failed", { status: 502 });
		}
	}
}
