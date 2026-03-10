/**
 * Moyin Parse Actions — extracted from moyin-store.ts to keep it under 800 lines.
 * Contains the calibration pipeline, PTY terminal execution helper, and model options.
 */

import type { ScriptData, ScriptScene } from "@/types/moyin-script";
import {
	calibrateTitleLLM,
	generateSynopsisLLM,
	enhanceCharactersLLM,
	enhanceScenesLLM,
} from "./moyin-calibration";
import { generateShotsForEpisodeAction } from "./moyin-generation";
import type { PipelineStep, PipelineStepStatus } from "./moyin-store";

// ==================== Model Options ====================

export const MODEL_OPTIONS = [
	{ value: "minimax", label: "MiniMax M2.5" },
	{ value: "gemini", label: "Gemini Flash" },
	{ value: "gemini-pro", label: "Gemini Pro" },
	{ value: "kimi", label: "Kimi K2.5" },
	{ value: "claude", label: "Claude (no key)" },
] as const;

/** Display label for a model alias */
export function getModelLabel(value: string): string {
	const opt = MODEL_OPTIONS.find((o) => o.value === value);
	return opt?.label ?? value;
}

// ==================== Calibration Pipeline ====================

interface StoreRef {
	getState: () => {
		scriptData: ScriptData | null;
		characters: import("@/types/moyin-script").ScriptCharacter[];
		scenes: ScriptScene[];
		episodes: import("@/types/moyin-script").Episode[];
		shots: import("@/types/moyin-script").Shot[];
		pipelineProgress: Record<PipelineStep, PipelineStepStatus>;
		pipelineStep: PipelineStep | null;
		lastTargetDuration?: string;
	};
	setState: (
		partial:
			| Partial<ReturnType<StoreRef["getState"]>>
			| ((
					state: ReturnType<StoreRef["getState"]>
			  ) => Partial<ReturnType<StoreRef["getState"]>>)
	) => void;
}

/**
 * Run the 5-step calibration pipeline after initial parse.
 * Extracted so both parseScript() and onParsed listener can use it.
 */
export async function runCalibrationPipeline(
	data: ScriptData,
	rawScript: string,
	store: StoreRef
): Promise<void> {
	const advancePipeline = (step: PipelineStep, status: PipelineStepStatus) => {
		const progress = { ...store.getState().pipelineProgress, [step]: status };
		store.setState({ pipelineStep: step, pipelineProgress: progress });
	};

	// Set data immediately so user can see results while calibration runs.
	// Preserve targetDuration from the generate step if the parsed data lacks it.
	const existingSD = store.getState().scriptData;
	const mergedData = {
		...data,
		targetDuration:
			data.targetDuration ||
			existingSD?.targetDuration ||
			store.getState().lastTargetDuration,
	};
	store.setState({
		scriptData: mergedData,
		characters: mergedData.characters ?? [],
		scenes: mergedData.scenes ?? [],
		episodes: mergedData.episodes ?? [],
		shots: [],
	});

	advancePipeline("import", "done");

	// --- Title Calibration ---
	advancePipeline("title_calibration", "active");
	try {
		const { title, logline } = await calibrateTitleLLM(data, rawScript);
		const updated = { ...data, title, logline };
		store.setState({ scriptData: updated });
		advancePipeline("title_calibration", "done");
	} catch (err) {
		console.warn("[Moyin] Title calibration failed:", err);
		advancePipeline("title_calibration", "error");
	}

	// --- Synopsis Generation ---
	advancePipeline("synopsis", "active");
	try {
		const synopsis = await generateSynopsisLLM(
			store.getState().scriptData ?? data,
			rawScript
		);
		const current = store.getState().scriptData;
		if (current) {
			store.setState({ scriptData: { ...current, logline: synopsis } });
		}
		advancePipeline("synopsis", "done");
	} catch (err) {
		console.warn("[Moyin] Synopsis generation failed:", err);
		advancePipeline("synopsis", "error");
	}

	// --- Shot Calibration ---
	advancePipeline("shot_calibration", "active");
	try {
		const { episodes, scenes, scriptData: sd } = store.getState();
		const allNewShots: import("@/types/moyin-script").Shot[] = [];
		for (const ep of episodes) {
			const epScenes = scenes.filter((s) => ep.sceneIds.includes(s.id));
			if (epScenes.length === 0) continue;
			const targetDur =
				sd?.targetDuration || store.getState().lastTargetDuration;
			const newShots = await generateShotsForEpisodeAction(
				epScenes,
				ep.title,
				sd?.title || "Unknown",
				targetDur
			);
			allNewShots.push(...newShots);
		}
		// Single setState: deduplicate with a Set for O(n) instead of O(n*m)
		if (allNewShots.length > 0) {
			const newIds = new Set(allNewShots.map((s) => s.id));
			store.setState((state) => ({
				shots: [
					...state.shots.filter((s) => !newIds.has(s.id)),
					...allNewShots,
				],
			}));
		}
		advancePipeline("shot_calibration", "done");
	} catch (err) {
		console.warn("[Moyin] Shot calibration failed:", err);
		advancePipeline("shot_calibration", "error");
	}

	// --- Character Calibration ---
	advancePipeline("character_calibration", "active");
	try {
		const { characters: chars, scriptData: sd2 } = store.getState();
		const enhanced = await enhanceCharactersLLM(chars, sd2, rawScript);
		store.setState({ characters: enhanced });
		advancePipeline("character_calibration", "done");
	} catch (err) {
		console.warn("[Moyin] Character calibration failed:", err);
		advancePipeline("character_calibration", "error");
	}

	// --- Scene Calibration ---
	advancePipeline("scene_calibration", "active");
	try {
		const { scenes: scns, scriptData: sd3 } = store.getState();
		const enhanced = await enhanceScenesLLM(scns, sd3, rawScript);
		store.setState({ scenes: enhanced });
		advancePipeline("scene_calibration", "done");
	} catch (err) {
		console.warn("[Moyin] Scene calibration failed:", err);
		advancePipeline("scene_calibration", "error");
	}
}

// ==================== PTY Terminal Execution ====================

import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { platform } from "@qcut/platform-core";

/** Module-scoped state for the active PTY parse run. */
let pendingTempScriptPath: string | null = null;
let cleanupTimerId: ReturnType<typeof setTimeout> | null = null;

/** Get the current pending temp script path (used by onParsed guard). */
export function getPendingTempScriptPath(): string | null {
	return pendingTempScriptPath;
}

/** Cancel the cleanup timer and clear the pending path after successful parse. */
export function clearPendingParse(): void {
	if (cleanupTimerId != null) {
		clearTimeout(cleanupTimerId);
		cleanupTimerId = null;
	}
	pendingTempScriptPath = null;
}

/**
 * Attempt to run parse-script via PTY terminal for streaming output.
 * Returns true if successfully initiated; data arrives via onParsed listener.
 * Returns false if PTY unavailable (caller should fall back to IPC).
 */
export async function attemptPtyParse(
	rawScript: string,
	model: string
): Promise<{ success: boolean; tempPath?: string }> {
	try {
		const api = platform().moyin;
		const ptyApi = platform().pty;
		if (!api?.saveTempScript || !ptyApi) return { success: false };

		// 1. Save script to temp file
		const saveResult = await api.saveTempScript({ rawScript });
		if (!saveResult.success || !saveResult.filePath) return { success: false };

		const projectRoot = saveResult.projectRoot;
		if (!projectRoot) {
			api.cleanupTempScript(saveResult.filePath)?.catch(() => {});
			return { success: false };
		}

		// 2. Switch to PTY terminal tab
		useMediaPanelStore.getState().setActiveTab("pty");

		// 3. Ensure shell session is running
		const ptyState = usePtyTerminalStore.getState();

		// If connected to a non-shell provider, bail out to IPC fallback
		// (don't kill an active agent session just to run parse)
		if (ptyState.status === "connected" && ptyState.cliProvider !== "shell") {
			api.cleanupTempScript(saveResult.filePath)?.catch(() => {});
			return { success: false };
		}

		// Spawn a shell session if not connected
		if (usePtyTerminalStore.getState().status !== "connected") {
			usePtyTerminalStore.getState().setCliProvider("shell");
			await usePtyTerminalStore.getState().connect({ manual: true });
			// Give shell time to initialize
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		const sessionId = usePtyTerminalStore.getState().sessionId;
		if (!sessionId) {
			api.cleanupTempScript(saveResult.filePath)?.catch(() => {});
			return { success: false };
		}

		// 4. Build and write CLI command (shell-quote values to prevent injection)
		const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
		const cmd = `cd ${q(projectRoot)} && bun run pipeline moyin:parse-script --script ${q(saveResult.filePath)} --model ${model} --stream`;

		await ptyApi.write(sessionId, cmd + "\n");

		// 5. Track the pending parse and schedule fallback cleanup (cancelled on success)
		pendingTempScriptPath = saveResult.filePath;
		if (cleanupTimerId != null) clearTimeout(cleanupTimerId);
		cleanupTimerId = setTimeout(() => {
			cleanupTimerId = null;
			if (pendingTempScriptPath === saveResult.filePath) {
				pendingTempScriptPath = null;
				api.cleanupTempScript(saveResult.filePath!)?.catch(() => {});
			}
		}, 300_000);

		return { success: true, tempPath: saveResult.filePath };
	} catch (error) {
		console.warn("[Moyin] PTY parse attempt failed:", error);
		return { success: false };
	}
}
