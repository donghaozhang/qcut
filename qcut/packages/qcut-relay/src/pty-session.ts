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

type PtyClientControlMessage = {
	kind: "resize";
	cols: number;
	rows: number;
};

const CODEX_AGENT_INSTRUCTIONS = [
	"## QCut Website Chat Agent Defaults",
	"",
	"You are QCut's website Chat Agent running inside a Daytona sandbox.",
	"Use the QCut native CLI for QCut work. Do not use external image or video tools when the QCut CLI can do the job.",
	"The QCut native CLI skill is available at /home/qcut/qcut/.claude/skills/native-cli/SKILL.md.",
	"Read that skill before nontrivial QCut CLI workflows or whenever command syntax is unclear.",
	"Useful first checks: qcut --version, qcut --help --json, and qcut system models --json.",
	"Uploaded user files and images are available under /tmp/qcut-input.",
	"When a user references an uploaded file, inspect /tmp/qcut-input before asking them to resend it.",
	"Write final user-requested files under /tmp/qcut-output so the website Sandbox files panel can list and download them.",
	"The QCut CLI default output directory is set with QCUT_OUTPUT_DIR=/tmp/qcut-output in this sandbox.",
	"For image generation, the QCut CLI default model is gpt_image_2_ima. Do not pass --model/-m unless the user explicitly requests a specific image model.",
	"Put temporary tools, caches, and package installs under /tmp/qcut-tools or /tmp, not /tmp/qcut-output.",
	"yt-dlp and deno are available for authorized video download probes.",
	"Codex is already running inside an externally isolated Daytona sandbox. Approval prompts and Codex sandboxing have been disabled intentionally for this environment.",
	"Wait for the user's next message before running a QCut task.",
].join("\n");

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
					id: buildDaytonaPtyId({ sessionId: claims.session_id }),
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

			// Materialize auth, then replace the shell with an already-authorized Codex session.
			await sendInput(new TextEncoder().encode("stty -echo\n"));
			await delay({ ms: 100 });
			await sendInput(
				new TextEncoder().encode(
					buildCodexStartupCommand({
						sessionId: claims.session_id,
						provider: session.provider,
						expiresAt: session.expires_at,
						openAiApiKey: this.env.OPENAI_API_KEY,
					})
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
						const controlMessage = parsePtyClientControlMessage({ data });
						if (controlMessage) {
							await resize?.(controlMessage.cols, controlMessage.rows);
							return;
						}
						await sendInput?.(data);
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

export function parsePtyClientControlMessage({
	data,
}: {
	data: string;
}): PtyClientControlMessage | null {
	if (!startsWithJsonObject({ data })) {
		return null;
	}
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const { kind, cols, rows } = record;
	if (kind !== "resize") {
		return null;
	}
	if (typeof cols !== "number" || typeof rows !== "number") {
		return null;
	}
	return { kind, cols, rows };
}

function startsWithJsonObject({ data }: { data: string }) {
	for (const char of data) {
		if (char === "{") {
			return true;
		}
		if (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") {
			return false;
		}
	}
	return false;
}

export function buildDaytonaPtyId({
	sessionId,
	nonce = crypto.randomUUID().slice(0, 8),
}: {
	sessionId: string;
	nonce?: string;
}) {
	const safeSessionPrefix = sessionId
		.replace(/[^0-9A-Za-z-]/g, "")
		.slice(0, 12);
	return `qcut-agent-${safeSessionPrefix}-${nonce}`;
}

export function buildCodexStartupCommand({
	sessionId,
	provider,
	expiresAt,
	openAiApiKey,
}: {
	sessionId: string;
	provider: string;
	expiresAt: string;
	openAiApiKey?: string;
}): string {
	const marker = `QCUT_CODEX_AGENT_${sessionId.replace(/[^A-Za-z0-9_]/g, "_")}`;
	const codexHome = `/home/qcut/.qcut-codex-home/${buildCodexHomeSessionName({
		sessionId,
	})}`;
	return `${[
		"/usr/local/bin/qcut-entrypoint /bin/true",
		"set +o history 2>/dev/null || true",
		"cd /home/qcut/qcut 2>/dev/null || exit 1",
		"mkdir -p /tmp/qcut-input /tmp/qcut-output /tmp/qcut-tools",
		"mkdir -p /tmp/qcut-tools/bin",
		"mkdir -p /tmp/qcut-tools/npm-global /tmp/qcut-tools/npm-cache",
		"export HISTFILE=/dev/null",
		`export CODEX_HOME=${shellSingleQuote({ value: codexHome })}`,
		'mkdir -p "$CODEX_HOME"',
		"export QCUT_OUTPUT_DIR=/tmp/qcut-output",
		"export NPM_CONFIG_PREFIX=/tmp/qcut-tools/npm-global",
		"export NPM_CONFIG_CACHE=/tmp/qcut-tools/npm-cache",
		"export QCUT_REAL_QCUT=$(command -v qcut)",
		"export QCUT_REAL_QCUT_PIPELINE=$(command -v qcut-pipeline 2>/dev/null || command -v qcut)",
		`cat > /tmp/qcut-tools/bin/qcut <<'QCUT_OUTPUT_WRAPPER'`,
		"#!/bin/sh",
		"name=${0##*/}",
		"real=${QCUT_REAL_QCUT:-qcut}",
		'if [ "$name" = "qcut-pipeline" ]; then',
		"  real=${QCUT_REAL_QCUT_PIPELINE:-$real}",
		"fi",
		'case " $* " in',
		"  *' --output-dir '*|*' -o '*|*' --output '*) exec \"$real\" \"$@\" ;;",
		"esac",
		'if [ -n "${QCUT_OUTPUT_DIR:-}" ]; then',
		'  exec "$real" "$@" --output-dir "$QCUT_OUTPUT_DIR"',
		"fi",
		'exec "$real" "$@"',
		"QCUT_OUTPUT_WRAPPER",
		"chmod +x /tmp/qcut-tools/bin/qcut",
		"ln -sf /tmp/qcut-tools/bin/qcut /tmp/qcut-tools/bin/qcut-pipeline",
		"export PATH=/tmp/qcut-tools/bin:/tmp/qcut-tools/npm-global/bin:$PATH",
		"[ -x /tmp/qcut-tools/npm-global/bin/codex ] || npm install -g @openai/codex >/tmp/qcut-tools/codex-bootstrap.log 2>&1 || true",
		"hash -r 2>/dev/null || true",
		'if ! grep -Fq \'[projects."/home/qcut/qcut"]\' "$CODEX_HOME/config.toml" 2>/dev/null; then',
		"cat >> \"$CODEX_HOME/config.toml\" <<'QCUT_CODEX_TRUST'",
		"",
		'[projects."/home/qcut/qcut"]',
		'trust_level = "trusted"',
		"QCUT_CODEX_TRUST",
		"fi",
		"if ! grep -Fq '## QCut Website Chat Agent Defaults' /home/qcut/qcut/AGENTS.md 2>/dev/null; then",
		`cat >> /home/qcut/qcut/AGENTS.md <<'${marker}'`,
		"",
		CODEX_AGENT_INSTRUCTIONS,
		marker,
		"fi",
		buildCodexApiKeyLoginCommand({ openAiApiKey }),
		"stty echo",
		"clear",
		`printf '%s\\n' ${shellSingleQuote({
			value: `qcut codex terminal | session ${sessionId.slice(0, 8)} | provider ${provider} | expires ${expiresAt}`,
		})}`,
		[
			"codex",
			"--dangerously-bypass-approvals-and-sandbox",
			"--no-alt-screen",
			"-C /home/qcut/qcut",
		].join(" "),
		"printf '\\nCodex exited. QCut shell fallback is ready; run qcut commands here.\\n'",
		"exec /bin/bash -l",
	].join("\n")}\n`;
}

function buildCodexHomeSessionName({
	sessionId,
}: {
	sessionId: string;
}): string {
	const safe = sessionId.replace(/[^0-9A-Za-z-]/g, "").slice(0, 32);
	return safe.length > 0 ? safe : "session";
}

function buildCodexApiKeyLoginCommand({
	openAiApiKey,
}: {
	openAiApiKey?: string;
}): string {
	const trimmedKey =
		typeof openAiApiKey === "string" ? openAiApiKey.trim() : "";
	if (trimmedKey.length === 0) {
		return "printf '%s\\n' 'OPENAI_API_KEY is not configured; Codex may require device auth.'";
	}
	return [
		`printf '%s' ${shellSingleQuote({ value: trimmedKey })} | codex login --with-api-key >/tmp/qcut-tools/codex-login.log 2>&1`,
		"if [ $? -ne 0 ]; then",
		"  printf '%s\\n' 'Codex API key login failed; see /tmp/qcut-tools/codex-login.log'",
		"fi",
	].join("\n");
}

function shellSingleQuote({ value }: { value: string }): string {
	return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function delay({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
