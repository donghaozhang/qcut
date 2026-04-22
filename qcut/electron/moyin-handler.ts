/**
 * Moyin IPC Handler
 * Handles script parsing and storyboard generation via LLM calls.
 */

import { ipcMain, app } from "electron";
import { writeFile, unlink } from "node:fs/promises";
import { join, basename, normalize } from "node:path";
import {
	callLLM,
	callClaudeCLI,
	isClaudeCLIAvailable,
} from "./moyin-llm.js";

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

// Re-export LLM dispatch for downstream consumers (e.g. novel-parse-handler)
// that were previously importing `callLLM` from this file directly.
export { callLLM };

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
