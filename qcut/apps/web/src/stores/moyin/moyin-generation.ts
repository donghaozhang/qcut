/**
 * Moyin generation helpers — storyboard generation, split-and-apply, stage analysis.
 * Extracted from moyin-store.ts to keep it under 800 lines.
 */

import type {
	Episode,
	ScriptCharacter,
	ScriptScene,
	ScriptData,
	Shot,
} from "@/types/moyin-script";
import { platform } from "@qcut/platform-core";
import { buildStoryboardPrompt } from "@/lib/moyin/storyboard/prompt-builder";
import { calculateGrid } from "@/lib/moyin/storyboard/grid-calculator";
import { VISUAL_STYLE_PRESETS } from "@/lib/moyin/presets/visual-styles";
import { generateFalImage } from "./moyin-shot-generation";

// ==================== Helpers ====================

/** Parse duration string to a shot budget. Each shot ≈ 10s of AI video. */
function parseShotBudget(
	duration: string,
	sceneCount: number
): number | undefined {
	const trimmed = duration.trim().toLowerCase();
	let seconds = 0;
	const mMatch = trimmed.match(/^([\d.]+)\s*m(?:in)?$/);
	if (mMatch) seconds = Math.round(parseFloat(mMatch[1]) * 60);
	const sMatch = trimmed.match(/^([\d.]+)\s*s(?:ec)?$/);
	if (sMatch) seconds = Math.round(parseFloat(sMatch[1]));
	if (!seconds) {
		const num = parseFloat(trimmed);
		if (Number.isFinite(num)) seconds = Math.round(num);
	}
	if (seconds <= 0) return undefined;
	// ~10s per shot, minimum 2 shots, at least 1 per scene
	return Math.max(Math.max(2, sceneCount), Math.round(seconds / 10));
}

// ==================== Types ====================

interface StoryboardResult {
	imageUrl: string;
	gridConfig: {
		cols: number;
		rows: number;
		cellWidth: number;
		cellHeight: number;
	};
}

interface SplitAndApplyResult {
	shots: Shot[];
}

// ==================== Storyboard Generation ====================

export async function generateStoryboardAction(
	scenes: ScriptScene[],
	characters: ScriptCharacter[],
	selectedStyleId: string,
	scriptData: ScriptData | null,
	onProgress: (progress: number) => void
): Promise<StoryboardResult> {
	onProgress(10);

	const stylePreset = VISUAL_STYLE_PRESETS.find(
		(s) => s.id === selectedStyleId
	);
	const styleTokens = stylePreset
		? [stylePreset.prompt]
		: ["Studio Ghibli style, anime, soft colors"];

	const storySummary = scenes
		.map(
			(s, i) =>
				`Scene ${i + 1}: ${s.visualPrompt || s.atmosphere || s.name || s.location || ""}`
		)
		.join("\n");

	const title = scriptData?.title || "";
	const storyPrompt = title ? `${title}\n\n${storySummary}` : storySummary;

	const characterDescriptions = characters
		.filter((c) => c.visualPromptEn || c.appearance)
		.map((c) => c.visualPromptEn || c.appearance || "");

	const aspectRatio = "16:9" as const;
	const resolution = "2K" as const;

	const gridConfig = calculateGrid({
		sceneCount: scenes.length,
		aspectRatio,
		resolution,
	});

	const prompt = buildStoryboardPrompt({
		story: storyPrompt,
		sceneCount: scenes.length,
		aspectRatio,
		resolution,
		styleTokens,
		characters:
			characterDescriptions.length > 0
				? characterDescriptions.map((desc, i) => ({
						name: characters[i]?.name || `Character ${i + 1}`,
						visualTraits: desc,
					}))
				: undefined,
	});

	onProgress(20);

	const imageUrl = await generateFalImage(prompt, {
		width: gridConfig.canvasWidth,
		height: gridConfig.canvasHeight,
	});

	return {
		imageUrl,
		gridConfig: {
			cols: gridConfig.cols,
			rows: gridConfig.rows,
			cellWidth: gridConfig.cellWidth,
			cellHeight: gridConfig.cellHeight,
		},
	};
}

// ==================== Split & Apply ====================

export async function splitAndApplyAction(
	storyboardImageUrl: string,
	gridConfig: { cols: number; rows: number },
	scenes: ScriptScene[],
	shots: Shot[],
	scriptData: ScriptData | null
): Promise<SplitAndApplyResult> {
	const { splitStoryboardImage } = await import(
		"@/lib/moyin/storyboard/image-splitter"
	);

	const results = await splitStoryboardImage(storyboardImageUrl, {
		aspectRatio: "16:9",
		resolution: "2K",
		sceneCount: scenes.length,
		options: {
			expectedCols: gridConfig.cols,
			expectedRows: gridConfig.rows,
		},
	});

	const updatedShots = [...shots];
	for (let i = 0; i < Math.min(results.length, updatedShots.length); i++) {
		updatedShots[i] = {
			...updatedShots[i],
			imageUrl: results[i].dataUrl,
			imageStatus: "completed",
		};
	}

	// Generate prompts for split scenes
	try {
		const { generateScenePrompts } = await import(
			"@/lib/moyin/storyboard/scene-prompt-generator"
		);
		const sceneInputs = updatedShots.map((shot, idx) => ({
			id: idx + 1,
			row: Math.floor(idx / gridConfig.cols),
			col: idx % gridConfig.cols,
			actionSummary: shot.actionSummary || "",
			cameraMovement: shot.cameraMovement || "",
			dialogue: shot.dialogue || "",
			sceneName: shot.actionSummary || `Shot ${idx + 1}`,
		}));

		const prompts = await generateScenePrompts({
			storyboardImage: storyboardImageUrl,
			storyPrompt: scriptData?.logline || "",
			scenes: sceneInputs,
			apiKey: "",
		});

		for (const p of prompts) {
			const idx = p.id - 1;
			if (idx >= 0 && idx < updatedShots.length) {
				updatedShots[idx] = {
					...updatedShots[idx],
					imagePrompt: p.imagePrompt || updatedShots[idx].imagePrompt,
					imagePromptZh: p.imagePromptZh || updatedShots[idx].imagePromptZh,
					videoPrompt: p.videoPrompt || updatedShots[idx].videoPrompt,
					videoPromptZh: p.videoPromptZh || updatedShots[idx].videoPromptZh,
					endFramePrompt: p.endFramePrompt || updatedShots[idx].endFramePrompt,
					endFramePromptZh:
						p.endFramePromptZh || updatedShots[idx].endFramePromptZh,
				};
			}
		}
	} catch {
		// Prompt generation is optional — don't fail the split
	}

	return { shots: updatedShots };
}

/**
 * Generate a list of shot definitions for an episode from its scenes and optional target duration.
 *
 * @param episodeScenes - Array of scene objects to base shot generation on
 * @param episodeTitle - Title of the episode used in prompts
 * @param scriptTitle - Title of the overall script/project used in prompts
 * @param targetDuration - Optional target duration string (e.g., "5m", "90s", or a numeric value). When provided, the function computes an approximate total shot budget and asks the LLM to produce roughly that many shots across all scenes.
 * @returns An array of Shot objects describing each generated shot (id, sceneRefId, index, actionSummary, shotSize, cameraMovement, characterIds, characterVariations, image/video status and progress, etc.)
 * @throws Error if the Moyin API is not available or if the LLM call fails or returns no usable text
 */

export async function generateShotsForEpisodeAction(
	episodeScenes: ScriptScene[],
	episodeTitle: string,
	scriptTitle: string,
	targetDuration?: string
): Promise<Shot[]> {
	let api: ReturnType<typeof platform>["moyin"] | undefined;
	try {
		api = platform().moyin;
	} catch {
		throw new Error("Moyin API not available.");
	}
	if (!api?.callLLM) {
		throw new Error("Moyin API not available.");
	}

	// Calculate shot budget from target duration.
	// Each AI video clip is 6-15 seconds (~10s average).
	const totalShotBudget = targetDuration
		? parseShotBudget(targetDuration, episodeScenes.length)
		: undefined;
	const shotsPerSceneHint = totalShotBudget
		? `Generate approximately ${totalShotBudget} shots total across all ${episodeScenes.length} scenes (target duration: ${targetDuration}, each shot ≈ 10 seconds of video).`
		: "Break each scene into 3-6 shots.";

	const sceneDescs = episodeScenes
		.map(
			(s, i) =>
				`Scene ${i + 1} (${s.id}): ${s.name || s.location}, ${s.time || ""}, ${s.atmosphere || ""}`
		)
		.join("\n");

	const result = await api.callLLM({
		systemPrompt: `You are a professional storyboard artist. ${shotsPerSceneHint}

Return JSON array:
[{ "id": "shot_001", "sceneRefId": "scene_id", "index": 0, "actionSummary": "description", "shotSize": "MS/CU/WS/etc", "cameraMovement": "pan/tilt/static/etc", "characterIds": [], "characterVariations": {}, "imageStatus": "idle", "imageProgress": 0, "videoStatus": "idle", "videoProgress": 0 }]

Only return the JSON array.`,
		userPrompt: `Project: "${scriptTitle}", Episode: "${episodeTitle}"

Scenes:
${sceneDescs}

Generate shots for each scene with proper camera language and visual storytelling.${totalShotBudget ? ` IMPORTANT: Total shot count must be approximately ${totalShotBudget} shots.` : ""}`,
		temperature: 0.5,
		maxTokens: 8192,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "Shot generation failed");
	}

	let cleaned = result.text
		.replace(/```json\n?/g, "")
		.replace(/```\n?/g, "")
		.trim();
	const jsonStart = cleaned.indexOf("[");
	const jsonEnd = cleaned.lastIndexOf("]");
	if (jsonStart !== -1 && jsonEnd !== -1) {
		cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
	}

	return JSON.parse(cleaned) as Shot[];
}

/**
 * Generate a screenplay/script from a short design idea by invoking the Moyin LLM.
 *
 * @param idea - A short design idea or prompt that the script will be based on.
 * @param options - Optional generation parameters. `options.targetDuration` is a duration hint (e.g., "60s"); `options.genre` is an optional genre hint.
 * @param config - Generation controls. Use `"auto"` for `sceneCount` or `shotCount` to let the generator decide; `selectedStyleId` selects a visual/style preset.
 * @returns The generated script text.
 * @throws If the Moyin API is unavailable (e.g., not running in Electron).
 * @throws If an underlying LLM call fails or returns an error.
 */

export async function generateScriptAction(
	idea: string,
	options: { genre?: string; targetDuration?: string },
	config: { sceneCount: string; shotCount: string; selectedStyleId: string }
): Promise<string> {
	const api = platform().moyin;
	if (!api?.callLLM) {
		throw new Error("Moyin API not available. Please run in Electron.");
	}

	const { generateScriptFromIdea } = await import(
		"@/lib/moyin/script/script-parser"
	);

	const llmAdapter = async (
		systemPrompt: string,
		userPrompt: string,
		opts?: { temperature?: number; maxTokens?: number }
	) => {
		const r = await api.callLLM({
			systemPrompt,
			userPrompt,
			temperature: opts?.temperature,
			maxTokens: opts?.maxTokens,
		});
		if (!r.success || !r.text) {
			throw new Error(r.error || "LLM call failed");
		}
		return r.text;
	};

	return generateScriptFromIdea(idea, llmAdapter, {
		targetDuration: options.targetDuration || "60s",
		sceneCount:
			config.sceneCount !== "auto" ? Number(config.sceneCount) : undefined,
		shotCount:
			config.shotCount !== "auto" ? Number(config.shotCount) : undefined,
		styleId: config.selectedStyleId,
	});
}

// ==================== Character Stage Analysis ====================

export async function analyzeStagesAction(
	characters: ScriptCharacter[],
	episodeCount: number,
	scriptData: ScriptData | null
): Promise<ScriptCharacter[]> {
	const {
		detectMultiStageHints,
		analyzeCharacterStages,
		convertStagesToVariations,
	} = await import("@/lib/moyin/script/character-stage-analyzer");

	const outline = scriptData?.logline || "";
	const hints = detectMultiStageHints(outline, episodeCount);
	if (!hints.suggestMultiStage) return characters;

	const background = {
		title: scriptData?.title || "",
		outline,
		characterBios: characters
			.map((c) => `${c.name}: ${c.role || ""}`)
			.join("\n"),
		era: "现代",
		genre: scriptData?.genre || "",
	};

	const analyses = await analyzeCharacterStages(
		background,
		characters,
		episodeCount
	);

	return characters.map((c) => {
		const analysis = analyses.find((a) => a.characterName === c.name);
		if (!analysis?.needsMultiStage) return c;
		const newVariations = convertStagesToVariations(analysis).map((v, i) => ({
			...v,
			id: `${c.id}_stage_${i}`,
		}));
		if (newVariations.length === 0) return c;
		return {
			...c,
			variations: [...(c.variations || []), ...newVariations],
		};
	});
}

// ==================== Duplicate Helpers ====================

export function duplicateEpisodeAction(
	id: string,
	episodes: Episode[],
	scenes: ScriptScene[],
	shots: Shot[]
): {
	episodes: Episode[];
	newScenes: ScriptScene[];
	newShots: Shot[];
} | null {
	const ep = episodes.find((e) => e.id === id);
	if (!ep) return null;
	const newEpId = `ep_${Date.now()}`;
	const sceneIdMap: Record<string, string> = {};
	const newScenes: ScriptScene[] = [];
	const newShots: Shot[] = [];
	for (const sid of ep.sceneIds || []) {
		const scene = scenes.find((s) => s.id === sid);
		if (!scene) continue;
		const newSid = `scene_dup_${Date.now()}_${sid}`;
		sceneIdMap[sid] = newSid;
		newScenes.push({
			...scene,
			id: newSid,
			name: scene.name ? `${scene.name} (copy)` : undefined,
		});
		for (const shot of shots.filter((s) => s.sceneRefId === sid)) {
			newShots.push({
				...shot,
				id: `shot_dup_${Date.now()}_${shot.id}`,
				sceneRefId: newSid,
				imageStatus: "idle",
				videoStatus: "idle",
				imageUrl: undefined,
				videoUrl: undefined,
			});
		}
	}
	const newEp: Episode = {
		...ep,
		id: newEpId,
		title: `${ep.title} (copy)`,
		sceneIds: (ep.sceneIds || []).map((sid) => sceneIdMap[sid] || sid),
	};
	const idx = episodes.findIndex((e) => e.id === id);
	const updatedEpisodes = [...episodes];
	updatedEpisodes.splice(idx + 1, 0, newEp);
	return { episodes: updatedEpisodes, newScenes, newShots };
}

export function duplicateSceneAction(
	id: string,
	scenes: ScriptScene[],
	shots: Shot[],
	episodes: Episode[]
): {
	scenes: ScriptScene[];
	newShots: Shot[];
	episodes: Episode[];
} | null {
	const scene = scenes.find((s) => s.id === id);
	if (!scene) return null;
	const newId = `scene_dup_${Date.now()}`;
	const newScene: ScriptScene = {
		...scene,
		id: newId,
		name: scene.name ? `${scene.name} (copy)` : `${scene.location} (copy)`,
	};
	const newShots: Shot[] = shots
		.filter((s) => s.sceneRefId === id)
		.map((shot) => ({
			...shot,
			id: `shot_dup_${Date.now()}_${shot.id}`,
			sceneRefId: newId,
			imageStatus: "idle" as const,
			videoStatus: "idle" as const,
			imageUrl: undefined,
			videoUrl: undefined,
		}));
	const idx = scenes.findIndex((s) => s.id === id);
	const updatedScenes = [...scenes];
	updatedScenes.splice(idx + 1, 0, newScene);
	const updatedEpisodes = episodes.map((ep) => {
		const sceneIdx = (ep.sceneIds || []).indexOf(id);
		if (sceneIdx === -1) return ep;
		const newSceneIds = [...(ep.sceneIds || [])];
		newSceneIds.splice(sceneIdx + 1, 0, newId);
		return { ...ep, sceneIds: newSceneIds };
	});
	return { scenes: updatedScenes, newShots, episodes: updatedEpisodes };
}

export function duplicateShotAction(id: string, shots: Shot[]): Shot[] | null {
	const shot = shots.find((s) => s.id === id);
	if (!shot) return null;
	const newShot: Shot = {
		...shot,
		id: `shot_dup_${Date.now()}`,
		imageStatus: "idle",
		videoStatus: "idle",
		imageUrl: undefined,
		videoUrl: undefined,
		imageProgress: 0,
		videoProgress: 0,
	};
	const idx = shots.findIndex((s) => s.id === id);
	const updatedShots = [...shots];
	updatedShots.splice(idx + 1, 0, newShot);
	return updatedShots;
}

// ==================== Reorder Helpers ====================

export function reorderShotsAction(
	shotId: string,
	targetIndex: number,
	shots: Shot[]
): Shot[] {
	const shot = shots.find((s) => s.id === shotId);
	if (!shot) return shots;
	const scene = shots.filter((s) => s.sceneRefId === shot.sceneRefId);
	const rest = shots.filter((s) => s.sceneRefId !== shot.sceneRefId);
	const without = scene.filter((s) => s.id !== shotId);
	without.splice(Math.max(0, Math.min(targetIndex, without.length)), 0, shot);
	return [...rest, ...without.map((s, i) => ({ ...s, index: i }))];
}

export function reorderScenesAction(
	episodeId: string,
	sceneId: string,
	targetIndex: number,
	episodes: Episode[]
): Episode[] {
	const ep = episodes.find((e) => e.id === episodeId);
	if (!ep) return episodes;
	const ids = (ep.sceneIds || []).filter((id) => id !== sceneId);
	ids.splice(Math.max(0, Math.min(targetIndex, ids.length)), 0, sceneId);
	return episodes.map((e) =>
		e.id === episodeId ? { ...e, sceneIds: ids } : e
	);
}
