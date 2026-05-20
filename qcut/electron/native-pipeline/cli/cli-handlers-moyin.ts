/**
 * CLI Moyin Script Parsing Handler
 *
 * Parses screenplay/story text into structured ScriptData (characters, scenes,
 * episodes) via OpenRouter, Gemini, or Claude CLI fallback.
 *
 * Provider priority: OPENROUTER_API_KEY → GEMINI_API_KEY → Claude CLI
 *
 * Usage:
 *   qcut-pipeline moyin:parse-script --script screenplay.txt
 *   qcut-pipeline moyin:parse-script --script screenplay.txt --model kimi --stream
 *   cat script.txt | qcut-pipeline moyin:parse-script --input - --json
 *
 * @module electron/native-pipeline/cli/cli-handlers-moyin
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { createEditorClient } from "../editor/editor-api-client.js";
import {
	envApiKeyProvider,
	OPENROUTER_BASE,
	GEMINI_BASE,
} from "../infra/api-caller.js";
import { isProxyAvailable, proxyRequest } from "../infra/proxy-client.js";
import { buildProviderUrl } from "../infra/api-provider-urls.js";

// ==================== Constants ====================

const CLAUDE_CLI_TIMEOUT_MS = 180_000;
const REQUEST_TIMEOUT_MS = 120_000;

const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Map user-friendly model names to OpenRouter model IDs. */
const MODEL_ALIASES: Record<string, string> = {
	kimi: "moonshotai/kimi-k2.5",
	"kimi-k2.5": "moonshotai/kimi-k2.5",
	minimax: "minimax/minimax-m2.5",
	"minimax-m2.5": "minimax/minimax-m2.5",
	gemini: "google/gemini-2.5-flash",
	"gemini-flash": "google/gemini-2.5-flash",
	"gemini-pro": "google/gemini-2.5-pro",
};

/**
 * GMI Cloud model aliases. Kept in sync with the Moyin IPC resolver in
 * `electron/moyin-llm.ts` so the CLI, the IPC handler, and the Director UI
 * all accept the same --model flag values.
 */
const GMI_MODEL_ALIASES: Record<string, string> = {
	"gmi-glm-5.1": "zai-org/GLM-5.1-FP8",
	"gmi-gemini-3.5-flash": "google/gemini-3.5-flash",
	"gmi-gemini-3.1-flash-lite": "google/gemini-3.1-flash-lite-preview",
	"gmi-gemini-3.1-pro": "google/gemini-3.1-pro-preview",
};

function isGmiAlias(model?: string): boolean {
	return !!model && model in GMI_MODEL_ALIASES;
}

function resolveModel(model?: string): string {
	if (!model) return DEFAULT_OPENROUTER_MODEL;
	return MODEL_ALIASES[model] ?? model;
}

const PARSE_SYSTEM_PROMPT = `You are a professional screenplay analyst. Analyze the screenplay/story text provided by the user and extract structured information.

Return results strictly in the following JSON format (no other text):
{
  "title": "Story title",
  "genre": "Genre (e.g., romance, thriller, comedy)",
  "logline": "One-sentence summary",
  "characters": [
    {
      "id": "char_1",
      "name": "Character name",
      "gender": "Gender",
      "age": "Age",
      "role": "Detailed identity/background description including occupation, status, backstory",
      "personality": "Detailed personality description including behavior patterns, values",
      "traits": "Core traits description including key abilities and characteristics",
      "skills": "Skills/abilities (martial arts, magic, professional skills, etc.)",
      "keyActions": "Key actions/deeds, important historical events",
      "appearance": "Physical appearance (if mentioned)",
      "relationships": "Relationships with other characters",
      "tags": ["Character tags, e.g.: protagonist, swordsman, villain"],
      "notes": "Character notes (plot context)"
    }
  ],
  "episodes": [
    {
      "id": "ep_1",
      "index": 1,
      "title": "Episode 1 title",
      "description": "Episode summary",
      "sceneIds": ["scene_1", "scene_2"]
    }
  ],
  "scenes": [
    {
      "id": "scene_1",
      "name": "Scene name (specific and identifiable)",
      "location": "Detailed location description including architecture, environment, geography",
      "time": "Time setting (day/night/dawn/dusk/noon/midnight)",
      "atmosphere": "Detailed atmosphere description",
      "visualPrompt": "Detailed visual description in English for concept art generation (lighting, weather, architecture style, special elements)",
      "tags": ["Scene element tags, e.g.: ancient, forest, ruins"],
      "notes": "Location notes (plot context)"
    }
  ],
  "storyParagraphs": [
    {
      "id": 1,
      "text": "Paragraph content",
      "sceneRefId": "scene_1"
    }
  ]
}

Important requirements:
1. Character info must be detailed - preserve all details from the source text
2. Scene design must be detailed - scenes are the foundation for visual generation
3. Identify multi-episode structure if present ("Episode X", "Chapter X", etc.)
4. If no episode markers, create a single episode containing all scenes
5. Character IDs use char_1, char_2 format
6. Scene IDs use scene_1, scene_2 format
7. Episode IDs use ep_1, ep_2 format
8. visualPrompt for scenes must be in English`;

// ==================== Input Reader ====================

/** Read script text from --script (file), --input (file/stdin), or --text (inline). */
function readScriptInput(options: CLIRunOptions): string | null {
	if (options.script) {
		const scriptPath = resolve(options.script);
		if (!existsSync(scriptPath)) return null;
		return readFileSync(scriptPath, "utf-8");
	}
	if (options.input) {
		if (options.input === "-") return readFileSync(0, "utf-8");
		const inputPath = resolve(options.input);
		if (existsSync(inputPath)) return readFileSync(inputPath, "utf-8");
		return options.input;
	}
	if (options.text) return options.text;
	return null;
}

// ==================== LLM Providers ====================

interface LLMCallOptions {
	model?: string;
	stream?: boolean;
	onChunk?: (text: string) => void;
}

interface LLMCallResult {
	text: string;
	provider: string;
	model: string;
}

/** Call OpenRouter's OpenAI-compatible chat/completions endpoint. */
async function callOpenRouter(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	options: LLMCallOptions = {}
): Promise<LLMCallResult> {
	const model = resolveModel(options.model);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const body: Record<string, unknown> = {
			model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: 0.7,
			max_tokens: 8192,
		};

		if (options.stream) {
			body.stream = true;
			const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (!response.ok) {
				const errText = await response.text().catch(() => "");
				throw new Error(
					`OpenRouter API error (${response.status}): ${errText.slice(0, 200)}`
				);
			}
			let accumulated = "";
			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response body for streaming");
			const decoder = new TextDecoder();
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6).trim();
					if (payload === "[DONE]") break;
					try {
						const parsed = JSON.parse(payload) as {
							choices?: Array<{ delta?: { content?: string } }>;
						};
						const delta = parsed.choices?.[0]?.delta?.content;
						if (delta) {
							accumulated += delta;
							options.onChunk?.(delta);
						}
					} catch {
						// skip malformed SSE lines
					}
				}
			}
			if (!accumulated)
				throw new Error("Empty streaming response from OpenRouter");
			return { text: accumulated, provider: "OpenRouter", model };
		}

		// Non-streaming
		const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`OpenRouter API error (${response.status}): ${errText.slice(0, 200)}`
			);
		}
		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) throw new Error("Empty response from OpenRouter");
		return { text: content, provider: "OpenRouter", model };
	} finally {
		clearTimeout(timeout);
	}
}

/** Call the Google Gemini generative language API directly. */
async function callGeminiDirect(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	options: LLMCallOptions = {}
): Promise<LLMCallResult> {
	const model = options.model?.startsWith("gemini-")
		? options.model
		: DEFAULT_GEMINI_MODEL;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		if (options.stream) {
			const response = await fetch(
				`${GEMINI_BASE}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						system_instruction: { parts: [{ text: systemPrompt }] },
						contents: [{ role: "user", parts: [{ text: userPrompt }] }],
						generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
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
			let accumulated = "";
			const reader = response.body?.getReader();
			if (!reader) throw new Error("No response body for streaming");
			const decoder = new TextDecoder();
			let buffer = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					try {
						const parsed = JSON.parse(line.slice(6)) as {
							candidates?: Array<{
								content?: { parts?: Array<{ text?: string }> };
							}>;
						};
						const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
						if (chunk) {
							accumulated += chunk;
							options.onChunk?.(chunk);
						}
					} catch {
						// skip malformed SSE lines
					}
				}
			}
			if (!accumulated) throw new Error("Empty streaming response from Gemini");
			return { text: accumulated, provider: "Gemini", model };
		}

		// Non-streaming
		const response = await fetch(
			`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					system_instruction: { parts: [{ text: systemPrompt }] },
					contents: [{ role: "user", parts: [{ text: userPrompt }] }],
					generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
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
		if (!text) throw new Error("Empty response from Gemini");
		return { text, provider: "Gemini", model };
	} finally {
		clearTimeout(timeout);
	}
}

/** Spawn claude -p with system prompt and user prompt via stdin. */
function callClaudeCLI(
	systemPrompt: string,
	userPrompt: string
): Promise<LLMCallResult> {
	return new Promise((resolveP, reject) => {
		const args = [
			"-p",
			"--model",
			"haiku",
			"--output-format",
			"json",
			"--max-turns",
			"1",
			"--system-prompt",
			systemPrompt,
		];

		const env = { ...process.env };
		delete env.CLAUDE_CODE;
		delete env.CLAUDECODE;
		delete env.CLAUDE_CODE_ENTRYPOINT;
		delete env.CLAUDE_CODE_SSE_PORT;

		const child = spawn("claude", args, {
			stdio: ["pipe", "pipe", "pipe"],
			env,
		});

		let stdout = "";
		let stderr = "";
		let settled = false;

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
			process.stderr.write(chunk);
		});

		const timeoutId = setTimeout(() => {
			if (!settled) {
				settled = true;
				child.kill("SIGTERM");
				reject(
					new Error(
						"Claude CLI timed out after 180s. Configure an API key for faster parsing."
					)
				);
			}
		}, CLAUDE_CLI_TIMEOUT_MS);

		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			if (code !== 0) {
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
				let text = raw;
				try {
					const envelope = JSON.parse(raw) as {
						result?: unknown;
						is_error?: unknown;
					};
					if (envelope.is_error === true) {
						reject(
							new Error(`Claude CLI error: ${envelope.result || "unknown"}`)
						);
						return;
					}
					if (typeof envelope.result === "string") {
						text = envelope.result;
					}
				} catch {
					// Not JSON envelope — use raw stdout as-is
				}
				resolveP({ text, provider: "Claude CLI", model: "haiku" });
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

		child.stdin.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			reject(new Error(`Claude CLI stdin error: ${err.message}`));
		});

		try {
			child.stdin.write(userPrompt);
			child.stdin.end();
		} catch (err) {
			if (!settled) {
				settled = true;
				clearTimeout(timeoutId);
				reject(
					new Error(
						`Failed to write to Claude CLI stdin: ${err instanceof Error ? err.message : String(err)}`
					)
				);
			}
		}
	});
}

// ==================== GMI (BYOK + Proxy) ====================

/** Call GMI Cloud's OpenAI-compatible chat/completions directly with a local key. */
async function callGmiDirect(
	apiKey: string,
	model: string,
	systemPrompt: string,
	userPrompt: string
): Promise<LLMCallResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(
			buildProviderUrl("gmi-llm", "chat/completions"),
			{
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
					temperature: 0.7,
					max_tokens: 8192,
				}),
				signal: controller.signal,
			}
		);
		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`GMI API error (${response.status}): ${errText.slice(0, 200)}`
			);
		}
		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content;
		if (!content) throw new Error("Empty response from GMI");
		return { text: content, provider: "GMI", model };
	} finally {
		clearTimeout(timeout);
	}
}

/** Call GMI Cloud chat/completions through the QCut license-server proxy. */
async function callGmiViaProxy(
	model: string,
	systemPrompt: string,
	userPrompt: string
): Promise<LLMCallResult> {
	const response = await proxyRequest({
		provider: "gmi-llm",
		endpoint: buildProviderUrl("gmi-llm", "chat/completions"),
		method: "POST",
		body: {
			model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: 0.7,
			max_tokens: 8192,
		},
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
	if (!content) throw new Error("Empty response from proxy GMI LLM");
	return { text: content, provider: "GMI (proxy)", model };
}

/** Call OpenRouter via the QCut license-server proxy (no local key required). */
async function callOpenRouterViaProxy(
	systemPrompt: string,
	userPrompt: string,
	options: LLMCallOptions = {}
): Promise<LLMCallResult> {
	const model = resolveModel(options.model);
	const response = await proxyRequest({
		provider: "openrouter",
		endpoint: buildProviderUrl("openrouter", "chat/completions"),
		method: "POST",
		body: {
			model,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			temperature: 0.7,
			max_tokens: 8192,
		},
		timeoutMs: REQUEST_TIMEOUT_MS,
	});
	if (!response.ok) {
		const preview =
			typeof response.data === "string"
				? response.data.slice(0, 200)
				: JSON.stringify(response.data).slice(0, 200);
		throw new Error(`Proxy OpenRouter error (${response.status}): ${preview}`);
	}
	const data = response.data as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data?.choices?.[0]?.message?.content;
	if (!content) throw new Error("Empty response from proxy OpenRouter");
	return { text: content, provider: "OpenRouter (proxy)", model };
}

// ==================== LLM Router ====================

/**
 * Route LLM call based on selected model and available credentials.
 *
 * Order of precedence:
 *   1. `gmi-*` aliases: local GMI key → GMI proxy → error
 *   2. Local OpenRouter key → OpenRouter direct
 *   3. Local Gemini key → Gemini direct
 *   4. Signed in (QCUT_AUTH_TOKEN) → OpenRouter via proxy
 *   5. Fallback → Claude CLI
 */
async function callLLM(
	systemPrompt: string,
	userPrompt: string,
	options: LLMCallOptions = {}
): Promise<LLMCallResult> {
	// 1. GMI alias? Prefer GMI, never fall back to OpenRouter/Gemini.
	if (isGmiAlias(options.model)) {
		const gmiModel = GMI_MODEL_ALIASES[options.model as string];
		const gmiKey =
			process.env.GMI_API_KEY?.trim() ||
			(await envApiKeyProvider("gmi")) ||
			(await envApiKeyProvider("gmi-llm"));
		if (gmiKey) {
			return callGmiDirect(gmiKey, gmiModel, systemPrompt, userPrompt);
		}
		if (await isProxyAvailable()) {
			return callGmiViaProxy(gmiModel, systemPrompt, userPrompt);
		}
		throw new Error(
			`No GMI API key configured for ${options.model}. Sign in to QCut, or set GMI_API_KEY in ~/.qcut/.env`
		);
	}

	// 2. Local OpenRouter key
	const openRouterKey = await envApiKeyProvider("openrouter");
	if (openRouterKey) {
		return callOpenRouter(openRouterKey, systemPrompt, userPrompt, options);
	}

	// 3. Local Gemini key
	const geminiKey = await envApiKeyProvider("google");
	if (geminiKey) {
		return callGeminiDirect(geminiKey, systemPrompt, userPrompt, options);
	}

	// 4. Signed in → OpenRouter via proxy
	if (await isProxyAvailable()) {
		return callOpenRouterViaProxy(systemPrompt, userPrompt, options);
	}

	// 5. Fallback — no streaming support
	return callClaudeCLI(systemPrompt, userPrompt);
}

// ==================== Helpers ====================

/** Check if an error message indicates a transient/retriable failure. */
function isTransientError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("rate limit") ||
		lower.includes("overloaded") ||
		lower.includes("429") ||
		lower.includes("503") ||
		lower.includes("econnreset") ||
		lower.includes("etimedout") ||
		lower.includes("socket hang up")
	);
}

/** Validate that parsed script data has required fields. */
function validateScriptData(data: Record<string, unknown>): void {
	if (!data.title || typeof data.title !== "string") {
		throw new Error("Missing required field: title");
	}
	if (!Array.isArray(data.characters) || data.characters.length === 0) {
		throw new Error("No characters found in parsed script");
	}
	if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
		throw new Error("No scenes found in parsed script");
	}
}

/** Extract the outermost JSON object from an LLM response. */
function extractJSON(response: string): Record<string, unknown> {
	const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
	let cleaned = jsonMatch ? jsonMatch[1].trim() : response.trim();

	const firstBrace = cleaned.indexOf("{");
	if (firstBrace === -1) {
		throw new Error("No JSON found in LLM response");
	}

	let depth = 0;
	let endIdx = firstBrace;
	for (let i = firstBrace; i < cleaned.length; i++) {
		if (cleaned[i] === "{") depth++;
		if (cleaned[i] === "}") depth--;
		if (depth === 0) {
			endIdx = i;
			break;
		}
	}
	cleaned = cleaned.substring(firstBrace, endIdx + 1);

	return JSON.parse(cleaned);
}

// ==================== Main Handler ====================

export async function handleMoyinParseScript(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const startTime = Date.now();

	// 1. Read script input
	const rawScript = readScriptInput(options);
	if (!rawScript || !rawScript.trim()) {
		return {
			success: false,
			error:
				"Missing script input. Use --script <file>, --input <file>, --text <text>, or pipe via --input -",
		};
	}

	const modelFlag = options.model || options.llmModel;
	const streamEnabled = options.stream ?? false;

	onProgress({
		stage: "parsing",
		percent: 10,
		message: `Parsing script (${rawScript.length} chars)...`,
	});

	// 2. Build user prompt with optional language/scene hints
	let userPrompt = rawScript;
	if (options.language && options.language !== "auto") {
		userPrompt = `[Language: ${options.language}]\n\n${userPrompt}`;
	}
	if (options.maxScenes) {
		userPrompt = `[Max scenes: ${options.maxScenes}]\n\n${userPrompt}`;
	}

	// 3. Call LLM with provider routing and optional streaming
	let streamChars = 0;
	const onChunk = streamEnabled
		? (chunk: string) => {
				streamChars += chunk.length;
				// Write raw tokens to stderr so users see live text in their terminal
				process.stderr.write(chunk);
			}
		: undefined;

	let result: LLMCallResult;
	try {
		result = await callLLM(PARSE_SYSTEM_PROMPT, userPrompt, {
			model: modelFlag,
			stream: streamEnabled,
			onChunk,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (!isTransientError(msg)) {
			return {
				success: false,
				error: msg,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		onProgress({
			stage: "retry",
			percent: 15,
			message: "Transient error, retrying...",
		});
		try {
			result = await callLLM(PARSE_SYSTEM_PROMPT, userPrompt, {
				model: modelFlag,
				stream: streamEnabled,
				onChunk,
			});
		} catch (retryErr) {
			return {
				success: false,
				error: retryErr instanceof Error ? retryErr.message : String(retryErr),
				duration: (Date.now() - startTime) / 1000,
			};
		}
	}

	if (streamEnabled && streamChars > 0) {
		process.stderr.write("\n");
	}

	onProgress({
		stage: "extracting",
		percent: 80,
		message: `Extracting structured data (via ${result.provider}/${result.model})...`,
	});

	// 4. Extract and validate JSON
	let parsed: Record<string, unknown>;
	try {
		parsed = extractJSON(result.text);
		validateScriptData(parsed);
	} catch (err) {
		return {
			success: false,
			error: `Failed to extract JSON from response: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// 5. Write output
	const outputDir = resolve(options.outputDir || "./output");
	mkdirSync(outputDir, { recursive: true });
	const outputPath = join(outputDir, "parsed-script.json");
	writeFileSync(outputPath, JSON.stringify(parsed, null, 2));

	const characters = (parsed.characters as unknown[])?.length || 0;
	const scenes = (parsed.scenes as unknown[])?.length || 0;
	const episodes = (parsed.episodes as unknown[])?.length || 0;
	const duration = (Date.now() - startTime) / 1000;

	// 6. Push parsed data to running QCut editor UI (if reachable)
	try {
		const client = createEditorClient(options);
		const healthy = await client.checkHealth();
		if (healthy) {
			await client.post("/api/claude/moyin/parse-result", {
				scriptData: parsed,
			});
			onProgress({
				stage: "ui-update",
				percent: 95,
				message: "Pushed parsed data to Director panel",
			});
		}
	} catch {
		// Editor not running — skip UI update silently
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: `Parsed: ${characters} characters, ${scenes} scenes, ${episodes} episodes (${duration.toFixed(1)}s) via ${result.provider}`,
	});

	return {
		success: true,
		outputPath,
		duration,
		data: {
			title: parsed.title,
			genre: parsed.genre,
			logline: parsed.logline,
			characters,
			scenes,
			episodes,
			provider: result.provider,
			model: result.model,
		},
	};
}
