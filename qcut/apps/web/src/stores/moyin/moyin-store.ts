/**
 * Moyin Store — session-scoped state for the Moyin tab workflow.
 * Manages script parsing, character extraction, scene breakdown, and generation.
 */

import { create } from "zustand";
import { platform } from "@qcut/platform-core";
import type {
	Episode,
	ScriptCharacter,
	ScriptData,
	ScriptScene,
	Shot,
} from "@/types/moyin-script";
import {
	buildShotImagePrompt,
	buildEndFramePrompt,
	generateFalImage,
	generateShotImageRequest,
	generateShotVideoRequest,
	persistShotMedia,
} from "./moyin-shot-generation";
import {
	partializeMoyinState,
	saveMoyinProject,
	loadMoyinProject,
	clearMoyinProject,
	type ParseStatus,
} from "./moyin-persistence";
import {
	calibrateTitleLLM,
	generateSynopsisLLM,
	enhanceCharactersLLM,
	enhanceScenesLLM,
} from "./moyin-calibration";
import {
	generateStoryboardAction,
	splitAndApplyAction,
	analyzeStagesAction,
	generateShotsForEpisodeAction,
	generateScriptAction,
	duplicateEpisodeAction,
	duplicateSceneAction,
	duplicateShotAction,
	reorderShotsAction,
	reorderScenesAction,
} from "./moyin-generation";
import { pushUndo, popUndo, popRedo } from "./moyin-undo";
import {
	runCalibrationPipeline,
	attemptPtyParse,
	getModelLabel,
	getPendingTempScriptPath,
	clearPendingParse,
} from "./moyin-parse-actions";
import { parseNovelImport } from "./moyin-novel-import";

// Types

export type MoyinStep = "script" | "characters" | "scenes" | "generate";
export type { ParseStatus } from "./moyin-persistence";
export type GenerationStatus = "idle" | "generating" | "done" | "error";
export type CalibrationStatus = "idle" | "calibrating" | "done" | "error";
export type PipelineStep =
	| "import"
	| "title_calibration"
	| "synopsis"
	| "shot_calibration"
	| "character_calibration"
	| "scene_calibration";
export type PipelineStepStatus = "pending" | "active" | "done" | "error";

interface MoyinState {
	projectId: string | null;
	activeStep: MoyinStep;
	rawScript: string;
	scriptData: ScriptData | null;
	parseStatus: ParseStatus;
	parseError: string | null;
	language: string;
	sceneCount: string;
	shotCount: string;
	chatConfigured: boolean;
	characters: ScriptCharacter[];
	scenes: ScriptScene[];
	shots: Shot[];
	shotGenerationStatus: Record<string, GenerationStatus>;
	episodes: Episode[];
	selectedItemId: string | null;
	selectedItemType: "episode" | "scene" | "character" | "shot" | null;
	pipelineStep: PipelineStep | null;
	pipelineProgress: Record<PipelineStep, PipelineStepStatus>;
	generationStatus: GenerationStatus;
	generationProgress: number;
	generationError: string | null;
	characterCalibrationStatus: CalibrationStatus;
	sceneCalibrationStatus: CalibrationStatus;
	calibrationError: string | null;
	selectedStyleId: string;
	selectedProfileId: string;
	storyboardImageUrl: string | null;
	storyboardGridConfig: {
		cols: number;
		rows: number;
		cellWidth: number;
		cellHeight: number;
	} | null;
	createStatus: "idle" | "generating" | "done" | "error";
	createError: string | null;
	selectedShotIds: Set<string>;
	parseModel: string;
	/** Preserved from generate step so shot calibration can respect it. */
	lastTargetDuration: string | undefined;
}

interface MoyinActions {
	setActiveStep: (step: MoyinStep) => void;
	setRawScript: (text: string) => void;
	parseScript: () => Promise<void>;
	parseNovel: (
		novelText: string,
		language?: "zh" | "en" | "auto"
	) => Promise<void>;
	clearScript: () => void;
	generateScript: (
		idea: string,
		options?: { genre?: string; targetDuration?: string }
	) => Promise<void>;
	setLanguage: (lang: string) => void;
	setSceneCount: (count: string) => void;
	setShotCount: (count: string) => void;
	setParseModel: (model: string) => void;
	checkApiKeyStatus: () => Promise<void>;
	updateCharacter: (id: string, updates: Partial<ScriptCharacter>) => void;
	addCharacter: (char: ScriptCharacter) => void;
	removeCharacter: (id: string) => void;
	updateScene: (id: string, updates: Partial<ScriptScene>) => void;
	addScene: (scene: ScriptScene) => void;
	removeScene: (id: string) => void;
	addShot: (shot: Shot) => void;
	updateShot: (id: string, updates: Partial<Shot>) => void;
	removeShot: (id: string) => void;
	generateShotsForEpisode: (episodeId: string) => Promise<void>;
	generateShotImage: (shotId: string) => Promise<void>;
	generateShotVideo: (shotId: string) => Promise<void>;
	generateEndFrameImage: (shotId: string) => Promise<void>;
	addEpisode: (ep: Episode) => void;
	updateEpisode: (id: string, updates: Partial<Episode>) => void;
	removeEpisode: (id: string) => void;
	duplicateEpisode: (id: string) => void;
	duplicateScene: (id: string) => void;
	duplicateShot: (id: string) => void;
	reorderShots: (shotId: string, targetIndex: number) => void;
	reorderScenes: (
		episodeId: string,
		sceneId: string,
		targetIndex: number
	) => void;
	toggleShotSelection: (shotId: string) => void;
	clearShotSelection: () => void;
	deleteSelectedShots: () => void;
	deleteSelectedItem: () => void;
	selectNextItem: () => void;
	selectPrevItem: () => void;
	setSelectedItem: (
		id: string | null,
		type: "episode" | "scene" | "character" | "shot" | null
	) => void;
	setSelectedStyleId: (id: string) => void;
	setSelectedProfileId: (id: string) => void;
	enhanceCharacters: () => Promise<void>;
	enhanceScenes: () => Promise<void>;
	analyzeCharacterStages: () => Promise<number>;
	generateStoryboard: () => Promise<void>;
	splitAndApplyStoryboard: () => Promise<void>;
	undo: () => void;
	redo: () => void;
	loadProject: (projectId: string) => void;
	saveProject: () => void;
	clearProjectData: () => void;
	reset: () => void;
}

export type MoyinStore = MoyinState & MoyinActions;

const initialState: MoyinState = {
	projectId: null,
	activeStep: "script",
	rawScript: "",
	scriptData: null,
	parseStatus: "idle",
	parseError: null,
	language: "English",
	sceneCount: "auto",
	shotCount: "auto",
	chatConfigured: false,
	characters: [],
	scenes: [],
	shots: [],
	shotGenerationStatus: {},
	episodes: [],
	selectedItemId: null,
	selectedItemType: null,
	pipelineStep: null,
	pipelineProgress: {
		import: "pending",
		title_calibration: "pending",
		synopsis: "pending",
		shot_calibration: "pending",
		character_calibration: "pending",
		scene_calibration: "pending",
	},
	generationStatus: "idle",
	generationProgress: 0,
	generationError: null,
	characterCalibrationStatus: "idle",
	sceneCalibrationStatus: "idle",
	calibrationError: null,
	selectedStyleId: "2d_ghibli",
	selectedProfileId: "classic-cinematic",
	storyboardImageUrl: null,
	storyboardGridConfig: null,
	createStatus: "idle",
	createError: null,
	selectedShotIds: new Set<string>(),
	parseModel: "minimax",
	lastTargetDuration: undefined,
};

/** Module-scoped: timeout ID for the 3-minute PTY parse guard. */
let parseTimeoutRef: ReturnType<typeof setTimeout> | null = null;

export const useMoyinStore = create<MoyinStore>((set, get) => {
	const patchShot = (shotId: string, updates: Partial<Shot>) =>
		set((state) => ({
			shots: state.shots.map((s) =>
				s.id === shotId ? { ...s, ...updates } : s
			),
		}));

	const snapshot = () => ({
		characters: get().characters,
		scenes: get().scenes,
		shots: get().shots,
	});

	const selectAdjacentItem = (dir: 1 | -1) => {
		const s = get();
		if (!s.selectedItemType) return;
		const list =
			{
				shot: s.shots,
				scene: s.scenes,
				character: s.characters,
				episode: s.episodes,
			}[s.selectedItemType] || [];
		const idx = list.findIndex((item) => item.id === s.selectedItemId);
		const next = idx + dir;
		if (next >= 0 && next < list.length) set({ selectedItemId: list[next].id });
	};

	return {
		...initialState,

		setActiveStep: (step) => set({ activeStep: step }),

		setRawScript: (text) => set({ rawScript: text }),

		setLanguage: (lang) => set({ language: lang }),
		setSceneCount: (count) => set({ sceneCount: count }),
		setShotCount: (count) => set({ shotCount: count }),
		setParseModel: (model) => set({ parseModel: model }),

		checkApiKeyStatus: async () => {
			try {
				const status = await platform().apiKeys.status();
				if (!status) {
					set({ chatConfigured: false });
					return;
				}
				let configured =
					status.openRouterApiKey?.set ||
					status.geminiApiKey?.set ||
					status.anthropicApiKey?.set ||
					false;
				if (!configured) {
					// Claude CLI is available as fallback (no API key required)
					const claudeAvailable =
						await platform().moyin.isClaudeAvailable?.();
					configured = !!claudeAvailable;
				}
				set({ chatConfigured: configured });
			} catch {
				set({ chatConfigured: false });
			}
		},

		parseScript: async () => {
			const { rawScript, parseModel } = get();
			if (!rawScript.trim()) return;

			const advancePipeline = (
				step: PipelineStep,
				status: PipelineStepStatus
			) => {
				const progress = { ...get().pipelineProgress, [step]: status };
				set({ pipelineStep: step, pipelineProgress: progress });
			};

			set({
				parseStatus: "parsing",
				parseError: null,
				pipelineStep: "import",
				pipelineProgress: initialState.pipelineProgress,
			});

			advancePipeline("import", "active");

			// --- PTY path: stream output in terminal, data arrives via onParsed ---
			const ptyResult = await attemptPtyParse(rawScript, parseModel);
			if (ptyResult.success) {
				const pendingPath = ptyResult.tempPath ?? null;
				// Set a 3-minute timeout for PTY path (scoped to this run)
				const parseTimeoutId = setTimeout(() => {
					const s = get();
					if (
						s.parseStatus === "parsing" &&
						getPendingTempScriptPath() === pendingPath
					) {
						clearPendingParse();
						set({
							parseStatus: "error",
							parseError: "Parse timed out. Check Terminal tab for errors.",
						});
					}
				}, 180_000);
				// Store timeout ID so onParsed can cancel it
				parseTimeoutRef = parseTimeoutId;
				return; // onParsed listener handles the rest
			}

			// --- IPC fallback: direct call when PTY is unavailable ---
			try {
				const api = platform().moyin;
				if (!api) {
					throw new Error("Moyin API not available. Please run in Electron.");
				}

				const result = await api.parseScript({ rawScript });

				if (!result.success || !result.data) {
					throw new Error(result.error || "Failed to parse script");
				}

				const data = result.data as unknown as ScriptData;
				set({
					shotGenerationStatus: {},
					selectedShotIds: new Set<string>(),
					activeStep: "characters",
				});
				await runCalibrationPipeline(data, rawScript, {
					getState: get,
					setState: set,
				});
				set({ parseStatus: "ready" });
			} catch (error) {
				const currentStep = get().pipelineStep;
				if (currentStep) advancePipeline(currentStep, "error");
				set({
					parseStatus: "error",
					parseError:
						error instanceof Error ? error.message : "Unknown parse error",
				});
			}
		},

		parseNovel: async (novelText, language = "auto") => {
			await parseNovelImport(novelText, language, get, set);
		},

		clearScript: () => {
			const { projectId } = get();
			set({ ...initialState, projectId });
		},

		generateScript: async (idea, options = {}) => {
			if (!idea.trim()) return;
			set({ createStatus: "generating", createError: null });

			try {
				const { sceneCount, shotCount, selectedStyleId } = get();
				const generatedText = await generateScriptAction(idea, options, {
					sceneCount,
					shotCount,
					selectedStyleId,
				});
				// Preserve targetDuration so shot calibration can respect it
				const currentSD = get().scriptData;
				const updatedSD: import("@/types/moyin-script").ScriptData = {
					...(currentSD ?? {
						title: "",
						language: "auto",
						characters: [],
						scenes: [],
						episodes: [],
						storyParagraphs: [],
					}),
					targetDuration: options.targetDuration,
				};
				set({
					rawScript: generatedText,
					createStatus: "done",
					createError: null,
					scriptData: updatedSD,
					lastTargetDuration: options.targetDuration,
				});
			} catch (error) {
				set({
					createStatus: "error",
					createError:
						error instanceof Error ? error.message : "Script generation failed",
				});
			}
		},

		updateCharacter: (id, updates) => {
			pushUndo(snapshot());
			set((state) => ({
				characters: state.characters.map((c) =>
					c.id === id ? { ...c, ...updates } : c
				),
			}));
		},
		addCharacter: (char) =>
			set((state) => ({ characters: [...state.characters, char] })),
		removeCharacter: (id) => {
			pushUndo(snapshot());
			set((state) => ({
				characters: state.characters.filter((c) => c.id !== id),
			}));
		},

		updateScene: (id, updates) => {
			pushUndo(snapshot());
			set((state) => ({
				scenes: state.scenes.map((s) =>
					s.id === id ? { ...s, ...updates } : s
				),
			}));
		},
		addScene: (scene) => set((state) => ({ scenes: [...state.scenes, scene] })),
		removeScene: (id) => {
			pushUndo(snapshot());
			set((state) => ({ scenes: state.scenes.filter((s) => s.id !== id) }));
		},
		addShot: (shot) => set((state) => ({ shots: [...state.shots, shot] })),
		updateShot: (id, updates) => {
			pushUndo(snapshot());
			set((state) => ({
				shots: state.shots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
			}));
		},
		removeShot: (id) => {
			pushUndo(snapshot());
			set((state) => ({ shots: state.shots.filter((s) => s.id !== id) }));
		},

		generateShotsForEpisode: async (episodeId) => {
			const { episodes, scenes, scriptData } = get();
			const episode = episodes.find((ep) => ep.id === episodeId);
			if (!episode) return;

			set((state) => ({
				shotGenerationStatus: {
					...state.shotGenerationStatus,
					[episodeId]: "generating",
				},
			}));

			try {
				const episodeScenes = scenes.filter((s) =>
					episode.sceneIds.includes(s.id)
				);
				const newShots = await generateShotsForEpisodeAction(
					episodeScenes,
					episode.title,
					scriptData?.title || "Unknown"
				);

				set((state) => ({
					shots: [
						...state.shots.filter(
							(s) => !episodeScenes.some((es) => es.id === s.sceneRefId)
						),
						...newShots,
					],
					shotGenerationStatus: {
						...state.shotGenerationStatus,
						[episodeId]: "done",
					},
				}));
			} catch (error) {
				set((state) => ({
					shotGenerationStatus: {
						...state.shotGenerationStatus,
						[episodeId]: "error",
					},
					calibrationError:
						error instanceof Error ? error.message : "Shot generation failed",
				}));
			}
		},

		generateShotImage: async (shotId) => {
			const { shots, characters, scenes, selectedStyleId } = get();
			const shot = shots.find((s) => s.id === shotId);
			if (!shot) return;
			patchShot(shotId, {
				imageStatus: "generating",
				imageProgress: 0,
				imageError: undefined,
			});
			try {
				const scene = scenes.find((s) => s.id === shot.sceneRefId);
				const prompt = buildShotImagePrompt(
					shot,
					scene,
					characters,
					selectedStyleId
				);
				patchShot(shotId, { imageProgress: 30 });
				const remoteImageUrl = await generateShotImageRequest(prompt);
				const imageUrl = await persistShotMedia(
					remoteImageUrl,
					`shot-${shotId}-image.png`
				);
				patchShot(shotId, {
					imageStatus: "completed",
					imageProgress: 100,
					imageUrl,
				});
			} catch (error) {
				patchShot(shotId, {
					imageStatus: "failed",
					imageError:
						error instanceof Error ? error.message : "Image generation failed",
				});
			}
		},
		generateShotVideo: async (shotId) => {
			const { shots } = get();
			const shot = shots.find((s) => s.id === shotId);
			if (!shot) return;
			patchShot(shotId, {
				videoStatus: "generating",
				videoProgress: 0,
				videoError: undefined,
			});
			try {
				if (!shot.imageUrl)
					throw new Error("Generate an image first before creating video.");
				const prompt = shot.videoPrompt || shot.actionSummary || "";
				patchShot(shotId, { videoProgress: 20 });
				const remoteVideoUrl = await generateShotVideoRequest(
					shot.imageUrl,
					prompt
				);
				const videoUrl = await persistShotMedia(
					remoteVideoUrl,
					`shot-${shotId}-video.mp4`
				);
				patchShot(shotId, {
					videoStatus: "completed",
					videoProgress: 100,
					videoUrl,
				});
			} catch (error) {
				patchShot(shotId, {
					videoStatus: "failed",
					videoError:
						error instanceof Error ? error.message : "Video generation failed",
				});
			}
		},
		generateEndFrameImage: async (shotId) => {
			const { shots } = get();
			const shot = shots.find((s) => s.id === shotId);
			if (!shot) return;
			patchShot(shotId, {
				endFrameImageStatus: "generating",
				endFrameImageError: undefined,
			});
			try {
				const prompt = buildEndFramePrompt(shot);
				if (!prompt) throw new Error("No end frame prompt available.");
				const remoteUrl = await generateFalImage(prompt);
				const endFrameImageUrl = await persistShotMedia(
					remoteUrl,
					`shot-${shotId}-endframe.png`
				);
				patchShot(shotId, {
					endFrameImageStatus: "completed",
					endFrameImageUrl,
					endFrameSource: "ai-generated",
				});
			} catch (error) {
				patchShot(shotId, {
					endFrameImageStatus: "failed",
					endFrameImageError:
						error instanceof Error
							? error.message
							: "End frame generation failed",
				});
			}
		},
		addEpisode: (ep) => set((state) => ({ episodes: [...state.episodes, ep] })),
		updateEpisode: (id, updates) =>
			set((state) => ({
				episodes: state.episodes.map((ep) =>
					ep.id === id ? { ...ep, ...updates } : ep
				),
			})),
		removeEpisode: (id) =>
			set((state) => ({
				episodes: state.episodes.filter((ep) => ep.id !== id),
			})),
		duplicateEpisode: (id) => {
			const { episodes, scenes, shots } = get();
			const result = duplicateEpisodeAction(id, episodes, scenes, shots);
			if (!result) return;
			set((state) => ({
				episodes: result.episodes,
				scenes: [...state.scenes, ...result.newScenes],
				shots: [...state.shots, ...result.newShots],
			}));
		},

		duplicateScene: (id) => {
			const { scenes, shots, episodes } = get();
			const result = duplicateSceneAction(id, scenes, shots, episodes);
			if (!result) return;
			set(() => ({
				scenes: result.scenes,
				shots: [...get().shots, ...result.newShots],
				episodes: result.episodes,
			}));
		},

		duplicateShot: (id) => {
			const result = duplicateShotAction(id, get().shots);
			if (!result) return;
			set({ shots: result });
		},

		reorderShots: (shotId, targetIndex) =>
			set({ shots: reorderShotsAction(shotId, targetIndex, get().shots) }),

		reorderScenes: (episodeId, sceneId, targetIndex) =>
			set({
				episodes: reorderScenesAction(
					episodeId,
					sceneId,
					targetIndex,
					get().episodes
				),
			}),

		toggleShotSelection: (shotId) =>
			set((state) => {
				const next = new Set(state.selectedShotIds);
				if (next.has(shotId)) next.delete(shotId);
				else next.add(shotId);
				return { selectedShotIds: next };
			}),
		clearShotSelection: () => set({ selectedShotIds: new Set<string>() }),
		deleteSelectedShots: () =>
			set((state) => {
				if (state.selectedShotIds.size === 0) return state;
				return {
					shots: state.shots.filter((s) => !state.selectedShotIds.has(s.id)),
					selectedShotIds: new Set<string>(),
				};
			}),

		deleteSelectedItem: () => {
			const { selectedItemId: id, selectedItemType: type } = get();
			if (!id || !type) return;
			const actions: Record<string, (id: string) => void> = {
				shot: get().removeShot,
				scene: get().removeScene,
				episode: get().removeEpisode,
				character: get().removeCharacter,
			};
			actions[type]?.(id);
			set({ selectedItemId: null, selectedItemType: null });
		},

		selectNextItem: () => selectAdjacentItem(1),
		selectPrevItem: () => selectAdjacentItem(-1),

		setSelectedItem: (id, type) =>
			set({ selectedItemId: id, selectedItemType: type }),

		setSelectedStyleId: (id) => set({ selectedStyleId: id }),

		setSelectedProfileId: (id) => set({ selectedProfileId: id }),

		enhanceCharacters: async () => {
			const { characters, scriptData, rawScript } = get();
			if (characters.length === 0) return;
			set({
				characterCalibrationStatus: "calibrating",
				calibrationError: null,
			});
			try {
				const enhanced = await enhanceCharactersLLM(
					characters,
					scriptData,
					rawScript
				);
				set({ characters: enhanced, characterCalibrationStatus: "done" });
			} catch (error) {
				set({
					characterCalibrationStatus: "error",
					calibrationError:
						error instanceof Error ? error.message : "Enhancement failed",
				});
			}
		},
		enhanceScenes: async () => {
			const { scenes, scriptData, rawScript } = get();
			if (scenes.length === 0) return;
			set({ sceneCalibrationStatus: "calibrating", calibrationError: null });
			try {
				const enhanced = await enhanceScenesLLM(scenes, scriptData, rawScript);
				set({ scenes: enhanced, sceneCalibrationStatus: "done" });
			} catch (error) {
				set({
					sceneCalibrationStatus: "error",
					calibrationError:
						error instanceof Error ? error.message : "Enhancement failed",
				});
			}
		},

		analyzeCharacterStages: async () => {
			const { characters, episodes, scriptData } = get();
			if (characters.length === 0 || episodes.length < 2) return 0;
			try {
				const updated = await analyzeStagesAction(
					characters,
					episodes.length,
					scriptData
				);
				const count = updated.filter(
					(c, i) =>
						(c.variations?.length || 0) >
						(characters[i].variations?.length || 0)
				).length;
				set({ characters: updated });
				return count;
			} catch (error) {
				console.error("[analyzeCharacterStages]", error);
				return 0;
			}
		},

		generateStoryboard: async () => {
			const { scenes, characters, selectedStyleId, scriptData } = get();
			if (scenes.length === 0) return;
			set({
				generationStatus: "generating",
				generationProgress: 0,
				generationError: null,
				storyboardImageUrl: null,
				storyboardGridConfig: null,
			});
			try {
				const result = await generateStoryboardAction(
					scenes,
					characters,
					selectedStyleId,
					scriptData,
					(p) => set({ generationProgress: p })
				);
				set({
					generationStatus: "done",
					generationProgress: 100,
					storyboardImageUrl: result.imageUrl,
					storyboardGridConfig: result.gridConfig,
				});
			} catch (error) {
				set({
					generationStatus: "error",
					generationError:
						error instanceof Error ? error.message : "Unknown generation error",
				});
			}
		},
		splitAndApplyStoryboard: async () => {
			const {
				storyboardImageUrl: url,
				storyboardGridConfig: grid,
				scenes,
				shots,
				scriptData,
			} = get();
			if (!url || !grid) return;
			try {
				const result = await splitAndApplyAction(
					url,
					grid,
					scenes,
					shots,
					scriptData
				);
				set({ shots: result.shots });
			} catch (error) {
				set({
					generationError:
						error instanceof Error
							? error.message
							: "Failed to split storyboard",
				});
			}
		},

		undo: () => {
			const entry = popUndo(snapshot());
			if (entry) set(entry);
		},
		redo: () => {
			const entry = popRedo(snapshot());
			if (entry) set(entry);
		},

		loadProject: (projectId) => {
			const saved = loadMoyinProject(projectId);
			set(
				saved
					? { ...initialState, ...saved, projectId }
					: { ...initialState, projectId }
			);
		},
		saveProject: () => {
			const s = get();
			if (s.projectId) saveMoyinProject(s.projectId, partializeMoyinState(s));
		},
		clearProjectData: () => {
			const { projectId } = get();
			if (projectId) clearMoyinProject(projectId);
			set(initialState);
		},
		reset: () => set(initialState),
	};
});

// Auto-save on state changes (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useMoyinStore.subscribe((state) => {
	if (!state.projectId) return;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveMoyinProject(state.projectId!, partializeMoyinState(state));
	}, 1000);
});

// Listen for parsed script data pushed from CLI via HTTP API
if (typeof window !== "undefined") {
	platform().moyin.onParsed?.((data: Record<string, unknown>) => {
		const state = useMoyinStore.getState();
		const scriptData = data as unknown as ScriptData;

		// Cancel timers and clean up temp file from PTY parse
		if (parseTimeoutRef != null) {
			clearTimeout(parseTimeoutRef);
			parseTimeoutRef = null;
		}
		const tempPath = getPendingTempScriptPath();
		if (tempPath) {
			platform().moyin.cleanupTempScript(tempPath)?.catch(() => {});
		}
		clearPendingParse();

		// Set initial data and switch to characters tab
		useMoyinStore.setState({
			shotGenerationStatus: {},
			selectedShotIds: new Set<string>(),
			activeStep: "characters",
		});

		// Run full calibration pipeline (title, synopsis, shots, characters, scenes)
		runCalibrationPipeline(scriptData, state.rawScript, {
			getState: useMoyinStore.getState,
			setState: useMoyinStore.setState,
		})
			.then(() => {
				useMoyinStore.setState({ parseStatus: "ready" });
			})
			.catch((err) => {
				console.error("[Moyin] Calibration after CLI push failed:", err);
				useMoyinStore.setState({
					parseStatus: "error",
					parseError: String(err),
				});
			});
	});
}
