import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { TEXT2IMAGE_MODEL_ORDER } from "@/lib/ai-models/text2image-models";
import {
	UPSCALE_MODEL_ORDER,
	UPSCALE_MODELS,
} from "@/lib/ai-models/upscale-models";
import type {
	UpscaleModelId,
	UpscaleScaleFactor,
} from "@/lib/ai-models/upscale-models";
import { upscaleImage as runUpscaleImage } from "@/lib/ai-clients/image-edit-client";
import type {
	ImageEditProgressCallback,
	ImageEditResponse,
	ImageUpscaleRequest,
} from "@/lib/ai-clients/image-edit-client";

// Debug flag - set to false to disable console logs
const DEBUG_TEXT2IMAGE_STORE = import.meta.env.DEV && false;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

const arraysEqual = (a: string[], b: string[]) =>
	a.length === b.length && a.every((value, index) => value === b[index]);

const computeUpscaleSettings = (
	previous: UpscaleSettings,
	settings: Partial<UpscaleSettings>
): UpscaleSettings => {
	const nextModelId = settings.selectedModel ?? previous.selectedModel;
	const model = UPSCALE_MODELS[nextModelId];
	const defaults =
		nextModelId === previous.selectedModel
			? previous
			: createDefaultUpscaleSettings(nextModelId);
	const scaleOptions = (model.controls.scaleFactor.options ??
		model.supportedScales) as UpscaleScaleFactor[];

	let nextScale: UpscaleScaleFactor =
		settings.scaleFactor ??
		(nextModelId === previous.selectedModel
			? previous.scaleFactor
			: defaults.scaleFactor);

	if (!scaleOptions.includes(nextScale)) {
		nextScale = scaleOptions[0] ?? defaults.scaleFactor;
	}

	const nextDenoise =
		settings.denoise !== undefined ? settings.denoise : defaults.denoise;
	const nextCreativity =
		settings.creativity !== undefined
			? settings.creativity
			: defaults.creativity;
	const nextOverlapping =
		settings.overlappingTiles !== undefined
			? settings.overlappingTiles
			: defaults.overlappingTiles;
	const nextFormat = settings.outputFormat ?? defaults.outputFormat;

	return {
		selectedModel: nextModelId,
		scaleFactor: nextScale,
		denoise: clamp(nextDenoise, 0, 100),
		creativity: model.features.creativity
			? clamp(nextCreativity ?? 0, 0, 100)
			: defaults.creativity,
		overlappingTiles: model.features.overlappingTiles
			? nextOverlapping
			: defaults.overlappingTiles,
		outputFormat: nextFormat,
	};
};

const areUpscaleSettingsEqual = (a: UpscaleSettings, b: UpscaleSettings) =>
	a.selectedModel === b.selectedModel &&
	a.scaleFactor === b.scaleFactor &&
	a.denoise === b.denoise &&
	a.creativity === b.creativity &&
	a.overlappingTiles === b.overlappingTiles &&
	a.outputFormat === b.outputFormat;

const createDefaultUpscaleSettings = (
	modelId: UpscaleModelId = UPSCALE_MODEL_ORDER[0]
): UpscaleSettings => {
	const model = UPSCALE_MODELS[modelId];
	const scaleOptions = (model.controls.scaleFactor.options ??
		model.supportedScales) as UpscaleScaleFactor[];
	const defaultScale =
		scaleOptions.length > 0
			? scaleOptions[0]
			: model.defaultParams.scale_factor;

	return {
		selectedModel: modelId,
		scaleFactor: defaultScale,
		denoise: Math.round((model.defaultParams.denoise ?? 0.5) * 100),
		creativity: Math.round((model.defaultParams.creativity ?? 0) * 100),
		overlappingTiles: Boolean(model.defaultParams.overlapping_tiles),
		outputFormat: (model.defaultParams.output_format ?? "png") as
			| "png"
			| "jpeg"
			| "webp",
	};
};

const DEFAULT_UPSCALE_SETTINGS = createDefaultUpscaleSettings();

const normalizeModelSelection = (models: string[]) =>
	TEXT2IMAGE_MODEL_ORDER.filter((modelId) => models.includes(modelId));

export type Text2ImageModelType =
	| "generation"
	| "upscale"
	| "angles"
	| "adjustment"
	| "camera"
	| "draw";

export interface GenerationResult {
	status: "loading" | "success" | "error";
	imageUrl?: string;
	error?: string;
	generatedAt?: Date;
}

export interface GenerationSettings {
	imageSize: string;
	seed?: number;
	outputFormat?: "png" | "jpeg" | "webp";
}

export interface UpscaleSettings {
	selectedModel: UpscaleModelId;
	scaleFactor: UpscaleScaleFactor;
	denoise: number; // 0-100 slider value
	creativity?: number; // 0-100 slider value (SeedVR only)
	overlappingTiles?: boolean; // Topaz only
	outputFormat: "png" | "jpeg" | "webp";
}

export interface SelectedResult {
	modelKey: string;
	imageUrl: string;
	prompt: string;
	settings: GenerationSettings | UpscaleSettings;
	mode: Text2ImageModelType;
}

const normalizeExtension = (extension?: string) => {
	if (!extension) return;
	const normalized = extension.replace(/^\./, "").toLowerCase();
	if (normalized === "jpg") return "jpeg";
	return ["png", "jpeg", "webp"].includes(normalized) ? normalized : undefined;
};

const getExtensionFromUrl = (url?: string) => {
	if (!url) return;

	if (url.startsWith("data:image/")) {
		const mimeExtension = url.slice("data:image/".length).split(/[;,]/)[0];
		return normalizeExtension(mimeExtension);
	}

	const withoutQuery = url.split(/[?#]/)[0];
	const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
	return normalizeExtension(match?.[1]);
};

const getResultExtension = (result: SelectedResult) =>
	normalizeExtension(
		(result.settings as GenerationSettings | UpscaleSettings)?.outputFormat
	) ||
	getExtensionFromUrl(result.imageUrl) ||
	"png";

interface Text2ImageStore {
	// Core state
	prompt: string;
	setPrompt: (prompt: string) => void;

	// Model type
	modelType: Text2ImageModelType;
	setModelType: (type: Text2ImageModelType) => void;

	// Model selection
	selectedModels: string[];
	setModelSelection: (modelKey: string, isSelected: boolean) => void;
	toggleModel: (modelKey: string) => void;
	selectModels: (models: string[]) => void;
	clearModelSelection: () => void;

	// Upscale settings
	upscaleSettings: UpscaleSettings;
	setUpscaleSettings: (settings: Partial<UpscaleSettings>) => void;

	// Generation mode
	generationMode: "single" | "multi";
	setGenerationMode: (mode: "single" | "multi") => void;

	// Generation state
	isGenerating: boolean;
	isUpscaling: boolean;
	generationResults: Record<string, GenerationResult>;

	// Result selection (for multi-model mode)
	selectedResults: SelectedResult[];
	toggleResultSelection: (result: SelectedResult) => void;
	clearSelectedResults: () => void;

	// Actions
	generateImages: (
		prompt: string,
		settings: GenerationSettings
	) => Promise<void>;
	upscaleImage: (
		imageUrl: string,
		options?: {
			onProgress?: ImageEditProgressCallback;
		}
	) => Promise<ImageEditResponse>;
	addSelectedToMedia: (results?: SelectedResult[]) => Promise<void>;
	clearResults: () => void;

	// History
	generationHistory: Array<{
		id: string;
		prompt: string;
		models: string[];
		results: Record<string, GenerationResult>;
		createdAt: Date;
		mode: Text2ImageModelType;
	}>;
	addToHistory: (
		prompt: string,
		models: string[],
		results: Record<string, GenerationResult>,
		mode?: Text2ImageModelType
	) => void;
}

export const useText2ImageStore = create<Text2ImageStore>()(
	devtools(
		(set, get) => ({
			// Core state
			prompt: "",
			setPrompt: (prompt) => set({ prompt }),

			// Model type state
			modelType: "generation",
			setModelType: (type) => {
				if (type === get().modelType) return;
				set({ modelType: type });
			},

			// Model selection
			selectedModels: [...TEXT2IMAGE_MODEL_ORDER], // Default to all models in curated priority order
			setModelSelection: (modelKey, isSelected) =>
				set((state) => {
					const alreadySelected = state.selectedModels.includes(modelKey);
					if (alreadySelected === isSelected) {
						return state;
					}

					const nextSelected = isSelected
						? [...state.selectedModels, modelKey]
						: state.selectedModels.filter((m) => m !== modelKey);
					const normalized = normalizeModelSelection(nextSelected);

					if (arraysEqual(state.selectedModels, normalized)) {
						return state;
					}

					return { selectedModels: normalized };
				}),
			toggleModel: (modelKey) => {
				const state = get();
				const shouldSelect = !state.selectedModels.includes(modelKey);
				state.setModelSelection(modelKey, shouldSelect);
			},
			selectModels: (models) =>
				set((state) => {
					const normalized = normalizeModelSelection(models);
					return arraysEqual(state.selectedModels, normalized)
						? state
						: { selectedModels: normalized };
				}),
			clearModelSelection: () => {
				get().selectModels([]);
			},

			// Upscale settings
			upscaleSettings: DEFAULT_UPSCALE_SETTINGS,
			setUpscaleSettings: (settings) =>
				set((state) => {
					const nextSettings = computeUpscaleSettings(
						state.upscaleSettings,
						settings
					);
					if (areUpscaleSettingsEqual(nextSettings, state.upscaleSettings)) {
						return state;
					}
					return { upscaleSettings: nextSettings };
				}),

			// Generation mode
			generationMode: "multi", // Default to multi-model mode
			setGenerationMode: (mode) => {
				if (mode === get().generationMode) {
					return;
				}

				set({ generationMode: mode });

				const state = get();
				const { selectedModels, selectModels } = state;

				if (mode === "single") {
					if (selectedModels.length === 0) {
						selectModels([TEXT2IMAGE_MODEL_ORDER[0]]);
					} else if (selectedModels.length > 1) {
						selectModels([selectedModels[0]]);
					}
				} else if (mode === "multi" && selectedModels.length === 0) {
					selectModels(TEXT2IMAGE_MODEL_ORDER.slice(0, 6));
				}
			},

			// Generation state
			isGenerating: false,
			isUpscaling: false,
			generationResults: {},

			// Result selection
			selectedResults: [],
			toggleResultSelection: (result) =>
				set((state) => {
					const isSelected = state.selectedResults.some(
						(r) => r.modelKey === result.modelKey
					);

					return {
						selectedResults: isSelected
							? state.selectedResults.filter(
									(r) => r.modelKey !== result.modelKey
								)
							: [...state.selectedResults, result],
					};
				}),
			clearSelectedResults: () => set({ selectedResults: [] }),

			// Actions
			generateImages: async (prompt, settings) => {
				if (DEBUG_TEXT2IMAGE_STORE)
					console.log("generateImages called with:", { prompt, settings });
				const { selectedModels, generationMode } = get();

				if (DEBUG_TEXT2IMAGE_STORE)
					console.log("Current store state:", {
						selectedModels,
						generationMode,
					});

				if (selectedModels.length === 0) {
					handleError(new Error("No models selected for image generation"), {
						operation: "Text-to-Image Generation",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.LOW,
						metadata: { prompt },
					});
					return;
				}

				set({
					isGenerating: true,
					generationResults: {},
					selectedResults: [],
				});

				// Initialize loading state for all selected models
				const initialResults: Record<string, GenerationResult> = {};
				selectedModels.forEach((modelKey) => {
					initialResults[modelKey] = { status: "loading" };
				});
				set({ generationResults: initialResults });

				try {
					// Import the generation service dynamically to avoid circular deps
					const { generateWithMultipleModels } = await import(
						"@/lib/ai-clients/fal-ai-client"
					);

					// Generate with all selected models in parallel
					const results = await generateWithMultipleModels(
						selectedModels,
						prompt,
						settings
					);

					// Update results as they complete
					const finalResults: Record<string, GenerationResult> = {};
					for (const [modelKey, result] of Object.entries(results)) {
						finalResults[modelKey] = {
							status: result.success ? "success" : "error",
							imageUrl: result.success ? result.imageUrl : undefined,
							error: result.success ? undefined : result.error,
							generatedAt: new Date(),
						};
					}

					set({
						generationResults: finalResults,
						isGenerating: false,
					});

					// Auto-select all successful results for media panel
					const successfulResults: SelectedResult[] = [];
					for (const [modelKey, result] of Object.entries(finalResults)) {
						if (result.status === "success" && result.imageUrl) {
							successfulResults.push({
								modelKey,
								imageUrl: result.imageUrl,
								prompt,
								settings,
								mode: "generation",
							});
						}
					}

					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							`🎯 TEXT2IMAGE-STORE: Auto-selecting ${successfulResults.length} successful results for media panel`
						);
					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							"🎯 TEXT2IMAGE-STORE: Successful results:",
							successfulResults.map((r) => ({
								model: r.modelKey,
								url: r.imageUrl.substring(0, 50) + "...",
							}))
						);
					set({ selectedResults: successfulResults });

					// Automatically add all successful results to media panel
					if (successfulResults.length > 0) {
						if (DEBUG_TEXT2IMAGE_STORE)
							console.log(
								"🚀 TEXT2IMAGE-STORE: Automatically calling addSelectedToMedia() with",
								successfulResults.length,
								"images"
							);
						await get().addSelectedToMedia(successfulResults);
						if (DEBUG_TEXT2IMAGE_STORE)
							console.log(
								"✅ TEXT2IMAGE-STORE: addSelectedToMedia() call completed"
							);
					} else {
						if (DEBUG_TEXT2IMAGE_STORE)
							console.warn(
								"⚠️ TEXT2IMAGE-STORE: No successful results to add to media panel"
							);
					}

					// Add to history
					get().addToHistory(
						prompt,
						selectedModels,
						finalResults,
						"generation"
					);
				} catch (error) {
					handleError(error, {
						operation: "Multi-Model Image Generation",
						category: ErrorCategory.AI_SERVICE,
						severity: ErrorSeverity.HIGH,
						metadata: {
							prompt,
							models: selectedModels,
							settings,
						},
					});

					// Mark all as failed
					const errorResults: Record<string, GenerationResult> = {};
					selectedModels.forEach((modelKey) => {
						errorResults[modelKey] = {
							status: "error",
							error: error instanceof Error ? error.message : "Unknown error",
						};
					});

					set({
						generationResults: errorResults,
						isGenerating: false,
					});
				}
			},

			upscaleImage: async (imageUrl, options) => {
				const { upscaleSettings } = get();
				const model = UPSCALE_MODELS[upscaleSettings.selectedModel];

				set({ isUpscaling: true });

				try {
					const request: ImageUpscaleRequest = {
						imageUrl,
						model: upscaleSettings.selectedModel,
						scaleFactor: upscaleSettings.scaleFactor,
						denoise: Number((upscaleSettings.denoise / 100).toFixed(2)),
						outputFormat: upscaleSettings.outputFormat,
					};

					if (model.features.creativity) {
						request.creativity = Number(
							((upscaleSettings.creativity ?? 0) / 100).toFixed(2)
						);
					}
					if (model.features.overlappingTiles) {
						request.overlappingTiles = Boolean(
							upscaleSettings.overlappingTiles
						);
					}

					const response = await runUpscaleImage(request, options?.onProgress);

					if (response.status === "completed" && response.result_url) {
						const promptLabel = `Upscale ${upscaleSettings.scaleFactor}x`;
						const result: GenerationResult = {
							status: "success",
							imageUrl: response.result_url,
							generatedAt: new Date(),
						};

						await get().addSelectedToMedia([
							{
								modelKey: request.model,
								imageUrl: response.result_url,
								prompt: promptLabel,
								settings: { ...upscaleSettings },
								mode: "upscale",
							},
						]);

						get().addToHistory(
							promptLabel,
							[request.model],
							{ [request.model]: result },
							"upscale"
						);
					}

					return response;
				} catch (error) {
					handleError(error, {
						operation: "Upscale Image",
						category: ErrorCategory.AI_SERVICE,
						severity: ErrorSeverity.HIGH,
						metadata: {
							model: upscaleSettings.selectedModel,
							scaleFactor: upscaleSettings.scaleFactor,
						},
					});
					throw error;
				} finally {
					set({ isUpscaling: false });
				}
			},

			addSelectedToMedia: async (results) => {
				const { selectedResults, generationResults, prompt } = get();
				const resultsToAdd = results || selectedResults;

				if (DEBUG_TEXT2IMAGE_STORE) {
					console.log(
						"📤 TEXT2IMAGE-STORE: addSelectedToMedia() called with:",
						{
							resultsCount: results?.length || 0,
							selectedResultsCount: selectedResults.length,
							totalResultsToAdd: resultsToAdd.length,
						}
					);
				}

				if (resultsToAdd.length === 0) {
					if (DEBUG_TEXT2IMAGE_STORE)
						console.warn(
							"⚠️ TEXT2IMAGE-STORE: No results selected to add to media"
						);
					return;
				}

				if (DEBUG_TEXT2IMAGE_STORE)
					console.log(
						`📋 TEXT2IMAGE-STORE: Preparing ${resultsToAdd.length} images for media panel`
					);
				if (DEBUG_TEXT2IMAGE_STORE)
					console.log(
						"📋 TEXT2IMAGE-STORE: Results to add:",
						resultsToAdd.map((r) => ({
							model: r.modelKey,
							prompt: r.prompt.substring(0, 30) + "...",
							hasUrl: !!r.imageUrl,
						}))
					);

				// Import media store dynamically to avoid circular deps
				if (DEBUG_TEXT2IMAGE_STORE)
					console.log(
						"🔄 TEXT2IMAGE-STORE: Importing media-store dynamically..."
					);

				try {
					const { useMediaStore } = await import("@/stores/media/media-store");

					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							"✅ TEXT2IMAGE-STORE: Media store imported successfully"
						);

					const { addGeneratedImages } = useMediaStore.getState();

					const mediaItems = resultsToAdd.map((result) => {
						const baseName = `${
							result.mode === "upscale" ? "Upscaled" : "Generated"
						}: ${result.prompt.slice(0, 30)}${
							result.prompt.length > 30 ? "..." : ""
						}`;

						return {
							url: result.imageUrl,
							type: "image" as const,
							name: `${baseName}.${getResultExtension(result)}`,
							size: 0, // Will be determined when loaded
							duration: 0,
							metadata: {
								source:
									result.mode === "upscale"
										? ("image-upscale" as const)
										: ("text2image" as const),
								model: result.modelKey,
								prompt: result.prompt,
								settings: result.settings,
								generatedAt: new Date(),
								mode: result.mode,
							},
						};
					});

					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							"📦 TEXT2IMAGE-STORE: Media items prepared:",
							mediaItems.length,
							"items"
						);
					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							"📦 TEXT2IMAGE-STORE: Calling media-store.addGeneratedImages()..."
						);
					await addGeneratedImages(mediaItems);
					if (DEBUG_TEXT2IMAGE_STORE)
						console.log(
							"✅ TEXT2IMAGE-STORE: media-store.addGeneratedImages() called successfully"
						);
				} catch (error) {
					handleError(error, {
						operation: "Import Media Store for Text-to-Image",
						category: ErrorCategory.STORAGE,
						severity: ErrorSeverity.HIGH,
						metadata: {
							operation: "add-to-media",
							resultCount: resultsToAdd.length,
						},
					});
				}

				// Clear selections after adding
				if (DEBUG_TEXT2IMAGE_STORE)
					console.log("🧹 TEXT2IMAGE-STORE: Clearing selected results");
				set({ selectedResults: [] });
			},

			clearResults: () =>
				set({
					generationResults: {},
					selectedResults: [],
					isGenerating: false,
				}),

			// History
			generationHistory: [],
			addToHistory: (prompt, models, results, mode = "generation") =>
				set((state) => ({
					generationHistory: [
						{
							id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
							prompt,
							models,
							results,
							createdAt: new Date(),
							mode,
						},
						...state.generationHistory.slice(0, 49), // Keep last 50 entries
					],
				})),
		}),
		{
			name: "text2image-store",
		}
	)
);
