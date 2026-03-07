/**
 * Moyin IPC Handler
 * Handles script parsing and storyboard generation via LLM calls.
 */

import { ipcMain, app } from "electron";
import { spawn, execSync } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join, basename, normalize } from "node:path";
import { getDecryptedApiKeys } from "./api-key-handler.js";

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
		// Keep no-op logger when electron-log is unavailable
	});

// ==================== Types ====================

export interface MoyinParseOptions {
	rawScript: string;
	language?: string;
	sceneCount?: number;
}

export interface MoyinParseResult {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
}

export interface MoyinGenerateOptions {
	scenes: Array<{
		id: string;
		name?: string;
		location?: string;
		visualPrompt?: string;
		[key: string]: unknown;
	}>;
	styleId?: string;
}

export interface MoyinGenerateResult {
	success: boolean;
	outputPaths?: string[];
	error?: string;
}

// ==================== System Prompt ====================

/**
 * System prompt for parsing screenplay text into structured ScriptData.
 * Inlined from apps/web/src/lib/moyin/script/system-prompts.ts to avoid
 * cross-app imports in Electron main process.
 */
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

// ==================== LLM Call ====================

const REQUEST_TIMEOUT_MS = 60_000;

/** Route an LLM call to OpenRouter, Gemini, or Claude CLI based on available keys. */
export async function callLLM(
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	const keys = await getDecryptedApiKeys();

	// Try OpenRouter key first, then Gemini
	const openaiKey = keys.openRouterApiKey;
	const googleKey = keys.geminiApiKey;

	if (!openaiKey && !googleKey) {
		throw new Error(
			"No LLM API key configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in Settings or ~/.qcut/.env"
		);
	}

	const provider = openaiKey ? "OpenRouter" : "Gemini";
	log.info(
		`[Moyin] callLLM using ${provider} (prompt: ${userPrompt.length} chars)`
	);

	if (openaiKey) {
		return callOpenAICompatible(openaiKey, systemPrompt, userPrompt, options);
	}

	return callGemini(googleKey!, systemPrompt, userPrompt);
}

/** Call an OpenAI-compatible API (OpenRouter or direct OpenAI). */
async function callOpenAICompatible(
	apiKey: string,
	systemPrompt: string,
	userPrompt: string,
	options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
	// Determine endpoint - OpenRouter or OpenAI
	const isOpenRouter = apiKey.startsWith("sk-or-");
	const baseUrl = isOpenRouter
		? "https://openrouter.ai/api/v1"
		: "https://api.openai.com/v1";
	const model = isOpenRouter ? "google/gemini-2.5-flash" : "gpt-4o-mini";

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

// ==================== Claude CLI Fallback ====================

const CLAUDE_CLI_TIMEOUT_MS = 600_000;

/** Spawn the Claude CLI as a child process for LLM inference (no API key needed). */
async function callClaudeCLI(
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

/** Check if claude CLI is available on PATH. */
function isClaudeCLIAvailable(): boolean {
	try {
		execSync("claude --version", { timeout: 5000, stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

// ==================== IPC Setup ====================

/** Register all moyin-related IPC handlers (parse, generate, call-llm, claude check). */
export function setupMoyinIPC(): void {
	// Parse screenplay text into structured data
	ipcMain.handle(
		"moyin:parse-script",
		async (_event, options: MoyinParseOptions): Promise<MoyinParseResult> => {
			try {
				log.info("[Moyin] Parsing script...", {
					length: options.rawScript.length,
					language: options.language,
				});

				let userPrompt = options.rawScript;
				if (options.language && options.language !== "auto") {
					userPrompt = `[Language: ${options.language}]\n\n${options.rawScript}`;
				}
				if (options.sceneCount) {
					userPrompt = `[Max scenes: ${options.sceneCount}]\n\n${userPrompt}`;
				}

				const response = await callLLM(PARSE_SYSTEM_PROMPT, userPrompt, {
					temperature: 0.7,
					maxTokens: 4096,
				});

				// Extract JSON from response
				const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
				let cleaned = jsonMatch ? jsonMatch[1].trim() : response.trim();

				// Find outermost JSON object
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

				const parsed = JSON.parse(cleaned);

				log.info("[Moyin] Script parsed successfully", {
					characters: parsed.characters?.length || 0,
					scenes: parsed.scenes?.length || 0,
				});

				return { success: true, data: parsed };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown parse error";
				log.error("[Moyin] Parse failed:", message);
				return { success: false, error: message };
			}
		}
	);

	// Generate storyboard images from scenes
	ipcMain.handle(
		"moyin:generate-storyboard",
		async (
			_event,
			options: MoyinGenerateOptions
		): Promise<MoyinGenerateResult> => {
			try {
				log.info("[Moyin] Generating storyboard...", {
					scenes: options.scenes.length,
					styleId: options.styleId,
				});

				// Storyboard generation will use the AI pipeline
				// For now, return a placeholder indicating the IPC is wired
				return {
					success: true,
					outputPaths: [],
				};
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown generation error";
				log.error("[Moyin] Generation failed:", message);
				return { success: false, error: message };
			}
		}
	);

	// Generic LLM call for script analysis, calibration, etc.
	ipcMain.handle(
		"moyin:call-llm",
		async (
			_event,
			options: {
				systemPrompt: string;
				userPrompt: string;
				temperature?: number;
				maxTokens?: number;
			}
		): Promise<{ success: boolean; text?: string; error?: string }> => {
			try {
				log.info("[Moyin] LLM call...", {
					systemLen: options.systemPrompt.length,
					userLen: options.userPrompt.length,
				});

				const text = await callLLM(options.systemPrompt, options.userPrompt, {
					temperature: options.temperature,
					maxTokens: options.maxTokens,
				});

				return { success: true, text };
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "Unknown LLM error";
				log.error("[Moyin] LLM call failed:", message);
				return { success: false, error: message };
			}
		}
	);

	// Check if Claude CLI is available (for fallback LLM)
	ipcMain.handle("moyin:is-claude-available", async (): Promise<boolean> => {
		return isClaudeCLIAvailable();
	});

	// Save raw script text to a temp file (for PTY terminal CLI execution)
	ipcMain.handle(
		"moyin:save-temp-script",
		async (
			_event,
			options: { rawScript: string }
		): Promise<{
			success: boolean;
			filePath?: string;
			projectRoot?: string;
			error?: string;
		}> => {
			try {
				const tempDir = app.getPath("temp");
				const filename = `moyin-script-${Date.now()}.txt`;
				const filePath = join(tempDir, filename);
				await writeFile(filePath, options.rawScript, "utf-8");
				log.info(
					`[Moyin] Saved temp script: ${filePath} (${options.rawScript.length} chars)`
				);
				return { success: true, filePath, projectRoot: process.cwd() };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to save temp script";
				log.error("[Moyin] Save temp script failed:", message);
				return { success: false, error: message };
			}
		}
	);

	// Clean up a temp script file (restricted to app temp dir with expected prefix)
	ipcMain.handle(
		"moyin:cleanup-temp-script",
		async (_event, filePath: string): Promise<void> => {
			try {
				const tempDir = app.getPath("temp");
				const resolved = normalize(filePath);
				if (
					!resolved.startsWith(tempDir) ||
					!basename(resolved).startsWith("moyin-script-")
				) {
					log.warn(`[Moyin] Blocked cleanup of non-temp path: ${filePath}`);
					return;
				}
				await unlink(resolved);
				log.info(`[Moyin] Cleaned up temp script: ${resolved}`);
			} catch {
				// Ignore cleanup errors (e.g., file already deleted)
			}
		}
	);
}

// CommonJS export for compiled JavaScript compatibility
module.exports = { setupMoyinIPC, callLLM };
export default { setupMoyinIPC, callLLM };
