/**
 * Moyin LLM Dispatch
 *
 * Routes LLM calls across four sources, in order:
 *   1. Local OpenRouter key → direct OpenAI-compatible fetch
 *   2. Local Gemini key → direct Gemini fetch
 *   3. License-server proxy (OpenRouter) when the user is signed in
 *   4. Claude CLI fallback (no key required, slow)
 *
 * Extracted from moyin-handler.ts so it can be imported by both the IPC
 * handler and the HTTP-route orchestrator, and unit-tested without the
 * handler file's CJS/ESM interop hack.
 */

import { spawn, execSync } from "node:child_process";
import { getDecryptedApiKeys } from "./api-key-handler.js";
import {
	isProxyAvailable,
	proxyRequest,
} from "./native-pipeline/infra/proxy-client.js";
import { buildProviderUrl } from "./native-pipeline/infra/api-provider-urls.js";

interface Logger {
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

const noop = (): void => {};
let log: Logger = { info: noop, warn: noop, error: noop };

import("electron-log")
	.then((module) => {
		log = module.default as Logger;
	})
	.catch(() => {
		// Keep no-op logger when electron-log is unavailable (e.g. under Vitest).
	});

const REQUEST_TIMEOUT_MS = 60_000;
const CLAUDE_CLI_TIMEOUT_MS = 600_000;

const GMI_LLM_BASE = "https://api.gmi-serving.com/v1";

export type LlmProvider = "openrouter" | "gmi-llm" | "gemini";

/**
 * Resolve a Moyin-side model alias (e.g. `gmi-glm-5.1`, `gemini-pro`) into
 * the concrete provider + provider-model-id that should handle the call.
 *
 * Keeping this as a pure function means both the IPC handler and the PTY
 * CLI path can agree on routing without duplicating the alias list.
 */
export function resolveLlmProvider(modelAlias?: string): {
	provider: LlmProvider;
	model: string;
} {
	switch (modelAlias) {
		case "gmi-glm-5.1":
			return { provider: "gmi-llm", model: "zai-org/GLM-5.1-FP8" };
		case "gmi-gemini-3.1-flash-lite":
			return {
				provider: "gmi-llm",
				model: "google/gemini-3.1-flash-lite-preview",
			};
		case "gmi-gemini-3.1-pro":
			return { provider: "gmi-llm", model: "google/gemini-3.1-pro-preview" };
		case "gemini":
		case "gemini-pro":
			// Future: route directly to Gemini. Today: fall through to openrouter
			// so existing behavior is unchanged when these aliases are passed.
			return { provider: "openrouter", model: "google/gemini-3-flash-preview" };
		default:
			return { provider: "openrouter", model: "google/gemini-3-flash-preview" };
	}
}

/**
 * Route an LLM call, preferring local keys (BYOK), then falling back to the
 * license-server proxy for signed-in users without a local key.
 *
 * When `options.model` is a `gmi-*` alias, the GMI route is preferred
 * (local GMI key → GMI proxy) before the legacy OpenRouter/Gemini chain.
 */
export async function callLLM(
	systemPrompt: string,
	userPrompt: string,
	options: {
		temperature?: number;
		maxTokens?: number;
		model?: string;
	} = {}
): Promise<string> {
	const keys = await getDecryptedApiKeys();
	const resolved = resolveLlmProvider(options.model);

	if (resolved.provider === "gmi-llm") {
		const gmiKey = keys.gmiApiKey;
		if (gmiKey) {
			log.info(
				`[Moyin] callLLM using GMI (${resolved.model}, prompt: ${userPrompt.length} chars)`
			);
			return callGmiLLM(
				gmiKey,
				resolved.model,
				systemPrompt,
				userPrompt,
				options
			);
		}
		if (await isProxyAvailable()) {
			log.info(
				`[Moyin] callLLM using GMI via proxy (${resolved.model}, prompt: ${userPrompt.length} chars)`
			);
			return callGmiViaProxy(
				resolved.model,
				systemPrompt,
				userPrompt,
				options
			);
		}
		throw new Error(
			`No GMI API key configured for model ${options.model}. Sign in to QCut, or set GMI_API_KEY in Settings or ~/.qcut/.env`
		);
	}

	const openaiKey = keys.openRouterApiKey;
	const googleKey = keys.geminiApiKey;

	if (openaiKey) {
		log.info(
			`[Moyin] callLLM using OpenRouter (prompt: ${userPrompt.length} chars)`
		);
		return callOpenAICompatible(openaiKey, systemPrompt, userPrompt, options);
	}

	if (googleKey) {
		log.info(
			`[Moyin] callLLM using Gemini (prompt: ${userPrompt.length} chars)`
		);
		return callGemini(googleKey, systemPrompt, userPrompt);
	}

	if (await isProxyAvailable()) {
		log.info(
			`[Moyin] callLLM using license-server proxy (prompt: ${userPrompt.length} chars)`
		);
		return callOpenRouterViaProxy(systemPrompt, userPrompt, options);
	}

	throw new Error(
		"No LLM API key configured. Sign in to QCut, or set OPENROUTER_API_KEY, GEMINI_API_KEY, or GMI_API_KEY in Settings or ~/.qcut/.env"
	);
}

/** Call GMI Cloud's chat/completions directly with a local API key. */
async function callGmiLLM(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(`${GMI_LLM_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(buildGmiChatPayload(model, systemPrompt, userPrompt, options)),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`GMI LLM error (${response.status}): ${errText.slice(0, 200)}`
			);
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error("Empty response from GMI LLM");
		}
		return content;
	} finally {
		clearTimeout(timeout);
	}
}

/** Call GMI Cloud's chat/completions via the license-server proxy. */
async function callGmiViaProxy(
	model: string,
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	const response = await proxyRequest({
		provider: "gmi-llm",
		// Full URL for the license server's allowlist (api.gmi-serving.com).
		endpoint: buildProviderUrl("gmi-llm", "chat/completions"),
		method: "POST",
		body: buildGmiChatPayload(model, systemPrompt, userPrompt, options),
		timeoutMs: REQUEST_TIMEOUT_MS,
	});

	if (!response.ok) {
		const preview =
			typeof response.data === "string"
				? response.data.slice(0, 200)
				: JSON.stringify(response.data).slice(0, 200);
		throw new Error(`Proxy GMI LLM error (${response.status}): ${preview}`);
	}

	const data = response.data as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data?.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error("Empty response from proxy GMI LLM");
	}
	return content;
}

/**
 * Build the OpenAI-compatible request body used by GMI. GPT-5-family models
 * require `max_completion_tokens` — mirror the same branch the ViMax
 * adapter uses so behavior stays consistent across features.
 */
function buildGmiChatPayload(
	model: string,
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Record<string, unknown> {
	const maxTokens = options.maxTokens ?? 4096;
	const payload: Record<string, unknown> = {
		model,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		temperature: options.temperature ?? 0.7,
	};
	if (model.startsWith("openai/gpt-5")) {
		payload.max_completion_tokens = maxTokens;
	} else {
		payload.max_tokens = maxTokens;
	}
	return payload;
}

/**
 * Call OpenRouter's chat/completions via the QCut license-server proxy.
 * Used when the user is signed in but has no local provider key.
 */
async function callOpenRouterViaProxy(
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	const response = await proxyRequest({
		provider: "openrouter",
		// License server validates against full-URL prefixes — send the
		// fully qualified endpoint so it passes the SSRF allowlist.
		endpoint: buildProviderUrl("openrouter", "chat/completions"),
		method: "POST",
		body: {
			model: "google/gemini-3-flash-preview",
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 4096,
		},
		timeoutMs: REQUEST_TIMEOUT_MS,
	});

	if (!response.ok) {
		const preview =
			typeof response.data === "string"
				? response.data.slice(0, 200)
				: JSON.stringify(response.data).slice(0, 200);
		throw new Error(`Proxy LLM error (${response.status}): ${preview}`);
	}

	const data = response.data as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data?.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error("Empty response from proxy LLM");
	}
	return content;
}

/** Call an OpenAI-compatible API (OpenRouter or direct OpenAI). */
async function callOpenAICompatible(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	const isOpenRouter = apiKey.startsWith("sk-or-");
	const baseUrl = isOpenRouter
		? "https://openrouter.ai/api/v1"
		: "https://api.openai.com/v1";
	const model = isOpenRouter ? "google/gemini-3-flash-preview" : "gpt-4o-mini";

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(`${baseUrl}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 4096,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`LLM API error (${response.status}): ${errText.slice(0, 200)}`
			);
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error("Empty response from LLM");
		}

		return content;
	} finally {
		clearTimeout(timeout);
	}
}

/** Call the Google Gemini generative language API. */
async function callGemini(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string
): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					system_instruction: {
						parts: [{ text: systemPrompt }],
					},
					contents: [{ role: "user", parts: [{ text: userPrompt }] }],
					generationConfig: {
						temperature: 0.7,
						maxOutputTokens: 4096,
					},
				}),
				signal: controller.signal,
			}
		);

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`Gemini API error (${response.status}): ${errText.slice(0, 200)}`
			);
		}

		const data = (await response.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
			}>;
		};
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error("Empty response from Gemini");
		}

		return text;
	} finally {
		clearTimeout(timeout);
	}
}

/** Spawn the Claude CLI as a child process for LLM inference (no API key needed). */
export async function callClaudeCLI(
	systemPrompt: string,
	userPrompt: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const args = [
			"-p",
			"--model",
			"claude-haiku-4-5-20251001",
			"--output-format",
			"json",
			"--max-turns",
			"1",
			"--system-prompt",
			systemPrompt,
		];

		log.info(
			"[Moyin] Spawning claude -p (claude-haiku-4-5-20251001, 600s timeout)..."
		);

		const env = { ...process.env };
		delete env.CLAUDECODE;
		delete env.CLAUDE_CODE_ENTRYPOINT;
		delete env.CLAUDE_CODE_SSE_PORT;

		const child = spawn("claude", args, {
			stdio: ["pipe", "pipe", "pipe"],
			env,
		});

		log.info("[Moyin] Claude CLI spawned, PID:", child.pid);

		let stdout = "";
		let stderr = "";
		let settled = false;

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
			log.info(
				`[Moyin] Claude CLI stdout chunk: +${chunk.length} bytes (total: ${stdout.length})`
			);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
			log.warn(
				`[Moyin] Claude CLI stderr: ${chunk.toString().trim().slice(0, 200)}`
			);
		});

		const timeoutId = setTimeout(() => {
			if (!settled) {
				settled = true;
				child.kill("SIGTERM");
				log.error("[Moyin] Claude CLI timed out after 600s");
				reject(
					new Error(
						"Claude CLI timed out after 600s. Configure an API key in Settings for faster parsing."
					)
				);
			}
		}, CLAUDE_CLI_TIMEOUT_MS);

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			if (code !== 0) {
				log.error(
					`[Moyin] Claude CLI exit ${code}: ${stderr.trim().slice(0, 200)}`
				);
				reject(
					new Error(
						`Claude CLI failed (exit ${code}): ${stderr.trim().slice(0, 200)}`
					)
				);
			} else {
				const raw = stdout.trim();
				if (!raw) {
					reject(new Error("Empty response from Claude CLI"));
					return;
				}

				// --output-format json wraps result in {type, result, ...}
				let text = raw;
				try {
					const envelope = JSON.parse(raw) as {
						result?: unknown;
						is_error?: unknown;
						duration_ms?: number;
					};
					if (envelope.is_error === true) {
						reject(
							new Error(`Claude CLI error: ${envelope.result || "unknown"}`)
						);
						return;
					}
					if (typeof envelope.result === "string") {
						log.info(`[Moyin] Claude CLI envelope: ${envelope.duration_ms}ms`);
						text = envelope.result;
					}
				} catch (e) {
					log.info(
						`[Moyin] Could not parse Claude CLI output as JSON envelope, using raw output. Error: ${e instanceof Error ? e.message : String(e)}`
					);
				}

				log.info(`[Moyin] Claude CLI returned ${text.length} chars`);
				resolve(text);
			}
		});

		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			reject(
				new Error(
					`Claude CLI not found: ${err.message}. Install with: npm install -g @anthropic-ai/claude-code`
				)
			);
		});

		child.stdin.write(userPrompt);
		child.stdin.end();
	});
}

/** Check if the claude CLI is available on PATH. */
export function isClaudeCLIAvailable(): boolean {
	try {
		execSync("claude --version", { timeout: 5000, stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}
