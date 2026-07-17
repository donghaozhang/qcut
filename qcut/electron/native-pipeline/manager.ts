/**
 * NativePipelineManager - Replaces AIPipelineManager
 *
 * Direct TypeScript execution instead of spawning Python binary.
 * Same public API so IPC layer needs zero changes.
 *
 * @module electron/native-pipeline/manager
 */

import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import { ModelRegistry } from "./infra/registry.js";
import { PipelineExecutor } from "./execution/executor.js";
import type { PipelineChain, PipelineStep } from "./execution/executor.js";
import { downloadOutput } from "./infra/api-caller.js";
import { parseChainConfig, validateChain } from "./execution/chain-parser.js";
import { estimateCost, listModels } from "./infra/cost-calculator.js";
import { resolveOutputDir as resolveOutputDirShared } from "./output/output-utils.js";
import { getDecryptedApiKeys } from "../api-key-handler.js";
import { importMediaFile } from "../claude/handlers/claude-media-handler.js";
import { inferProjectIdFromPath } from "../ai-pipeline-output.js";
import {
	handleVimaxIdea2Video,
	handleVimaxScript2Video,
	handleVimaxNovel2Movie,
	handleVimaxExtractCharacters,
	handleVimaxGenerateScript,
	handleVimaxGenerateStoryboard,
	handleVimaxGeneratePortraits,
	handleVimaxCreateRegistry,
	handleVimaxShowRegistry,
	handleVimaxListModels,
} from "./cli/vimax-cli-handlers.js";
import type { CLIRunOptions } from "./cli/cli-runner/types.js";
import { handleGenerateMusic } from "./cli/cli-handlers-music.js";
import { handleGenerateSpeech } from "./cli/cli-handlers-speech.js";

// Re-export types from the original handler for compatibility
export interface GenerateOptions {
	command:
		| "generate-image"
		| "create-video"
		| "generate-avatar"
		| "generate-music"
		| "generate-speech"
		| "list-models"
		| "estimate-cost"
		| "run-pipeline"
		| "vimax:idea2video"
		| "vimax:script2video"
		| "vimax:novel2movie"
		| "vimax:extract-characters"
		| "vimax:generate-script"
		| "vimax:generate-storyboard"
		| "vimax:generate-portraits"
		| "vimax:create-registry"
		| "vimax:show-registry"
		| "vimax:list-models";
	args: Record<string, string | number | boolean>;
	outputDir?: string;
	sessionId?: string;
	projectId?: string;
	autoImport?: boolean;
}

export interface PipelineProgress {
	stage: string;
	percent: number;
	message: string;
	model?: string;
	eta?: number;
}

export interface PipelineResult {
	success: boolean;
	outputPath?: string;
	outputPaths?: string[];
	error?: string;
	errorCode?: string;
	duration?: number;
	cost?: number;
	models?: string[];
	data?: unknown;
	mediaId?: string;
	importedPath?: string;
	importWarning?: string;
}

export interface PipelineStatus {
	available: boolean;
	version: string | null;
	source: "native" | "bundled" | "system" | "python" | "unavailable";
	compatible: boolean;
	features: Record<string, boolean>;
	error?: string;
}

const VERSION = "1.0.0-native";

export class NativePipelineManager {
	private activeRequests = new Map<string, AbortController>();
	private executor = new PipelineExecutor();

	async isAvailable(): Promise<boolean> {
		const keys = await getDecryptedApiKeys();
		const hasFalKey = !!(
			process.env.FAL_KEY ||
			process.env.FAL_API_KEY ||
			keys.falApiKey
		);
		return hasFalKey;
	}

	async getStatus(): Promise<PipelineStatus> {
		const available = await this.isAvailable();
		if (!available) {
			return {
				available: false,
				version: VERSION,
				source: "native",
				compatible: true,
				features: {},
				error:
					"No API keys configured. Go to Editor -> Settings -> API Keys to set your FAL API key.",
			};
		}

		return {
			available: true,
			version: VERSION,
			source: "native",
			compatible: true,
			features: this.getFeatures(),
		};
	}

	private getFeatures(): Record<string, boolean> {
		return {
			textToVideo: true,
			imageToVideo: true,
			textToImage: true,
			imageToImage: true,
			avatarGeneration: true,
			videoUpscale: true,
			yamlPipelines: true,
			costEstimation: true,
			promptGeneration: true,
			speechToText: true,
			musicGeneration: true,
			textToSpeech: true,
			imageUnderstanding: true,
			vimaxPipelines: true,
		};
	}

	async execute(
		options: GenerateOptions,
		onProgress: (progress: PipelineProgress) => void
	): Promise<PipelineResult> {
		const startTime = Date.now();
		const sessionId = options.sessionId || `ai-${Date.now()}`;

		try {
			switch (options.command) {
				case "list-models":
					return this.handleListModels(options);
				case "estimate-cost":
					return this.handleEstimateCost(options);
				case "generate-image":
					return this.handleGenerate(options, sessionId, onProgress, startTime);
				case "create-video":
					return this.handleGenerate(options, sessionId, onProgress, startTime);
				case "generate-avatar":
					return this.handleGenerate(options, sessionId, onProgress, startTime);
				case "generate-music":
					return this.handleGenerateMusic(
						options,
						sessionId,
						onProgress,
						startTime
					);
				case "generate-speech":
					return this.handleGenerateSpeech(
						options,
						sessionId,
						onProgress,
						startTime
					);
				case "run-pipeline":
					return this.handleRunPipeline(
						options,
						sessionId,
						onProgress,
						startTime
					);
				case "vimax:idea2video":
				case "vimax:script2video":
				case "vimax:novel2movie":
				case "vimax:extract-characters":
				case "vimax:generate-script":
				case "vimax:generate-storyboard":
				case "vimax:generate-portraits":
				case "vimax:create-registry":
				case "vimax:show-registry":
				case "vimax:list-models":
					return this.handleVimaxCommand(
						options,
						sessionId,
						onProgress,
						startTime
					);
				default:
					return {
						success: false,
						error: `Unknown command: ${options.command}`,
						errorCode: "generation_failed",
					};
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				success: false,
				error: msg,
				errorCode: "generation_failed",
				duration: (Date.now() - startTime) / 1000,
			};
		}
	}

	private handleListModels(options: GenerateOptions): PipelineResult {
		const category = options.args.category as string | undefined;
		const models = category
			? listModels({ category: category as never })
			: listModels();

		const supported = ModelRegistry.getSupportedModels();
		return {
			success: true,
			data: {
				models: models.map((m) => ({
					key: m.key,
					name: m.name,
					provider: m.provider,
					categories: m.categories,
					costEstimate: m.costEstimate,
					description: m.description,
				})),
				supported,
				count: models.length,
			},
			models: models.map((m) => m.key),
		};
	}

	private handleEstimateCost(options: GenerateOptions): PipelineResult {
		const modelKey = options.args.model as string;
		if (!modelKey) {
			return {
				success: false,
				error: "No model specified",
				errorCode: "generation_failed",
			};
		}
		if (!ModelRegistry.has(modelKey)) {
			return {
				success: false,
				error: `Unknown model: ${modelKey}`,
				errorCode: "generation_failed",
			};
		}

		const params: Record<string, unknown> = {};
		if (options.args.duration) params.duration = options.args.duration;
		if (options.args.resolution) params.resolution = options.args.resolution;

		const estimate = estimateCost(modelKey, params);
		return {
			success: true,
			cost: estimate.totalCost,
			data: estimate,
		};
	}

	private async handleGenerate(
		options: GenerateOptions,
		sessionId: string,
		onProgress: (progress: PipelineProgress) => void,
		startTime: number
	): Promise<PipelineResult> {
		const modelKey = options.args.model as string;
		if (!modelKey) {
			return {
				success: false,
				error: "No model specified",
				errorCode: "generation_failed",
			};
		}
		if (!ModelRegistry.has(modelKey)) {
			return {
				success: false,
				error: `Unknown model: ${modelKey}`,
				errorCode: "generation_failed",
			};
		}

		const model = ModelRegistry.get(modelKey);
		const abortController = new AbortController();
		this.activeRequests.set(sessionId, abortController);

		const outputDir = this.resolveOutputDir(options, sessionId);
		const params = this.buildParams(options.args);

		onProgress({
			stage: "starting",
			percent: 0,
			message: `Starting ${model.name}...`,
			model: modelKey,
		});

		try {
			const step: PipelineStep = {
				type: model.categories[0],
				model: modelKey,
				params,
				enabled: true,
				retryCount: 0,
			};

			const input = this.buildStepInput(options.args);

			const result = await this.executor.executeStep(step, input, {
				outputDir,
				onProgress: (percent, message) => {
					onProgress({
						stage: "processing",
						percent,
						message,
						model: modelKey,
					});
				},
				signal: abortController.signal,
			});

			this.activeRequests.delete(sessionId);

			if (!result.success) {
				return {
					success: false,
					error: result.error,
					errorCode: "generation_failed",
					duration: (Date.now() - startTime) / 1000,
				};
			}

			if (!result.outputPath && result.outputUrl && outputDir) {
				const ext = this.guessExtFromCommand(options.command);
				const filename = `output_${Date.now()}${ext}`;
				const destPath = path.join(outputDir, filename);
				try {
					result.outputPath = await downloadOutput(result.outputUrl, destPath);
				} catch (err) {
					console.warn("[NativePipeline] Download failed:", err);
				}
			}

			const pipelineResult: PipelineResult = {
				success: true,
				outputPath: result.outputPath,
				outputPaths: result.outputPath ? [result.outputPath] : undefined,
				duration: (Date.now() - startTime) / 1000,
				cost: result.cost,
				models: [modelKey],
			};

			return this.maybeAutoImport(options, pipelineResult);
		} catch (err) {
			this.activeRequests.delete(sessionId);
			throw err;
		}
	}

	private async handleGenerateSpeech(
		options: GenerateOptions,
		sessionId: string,
		onProgress: (progress: PipelineProgress) => void,
		startTime: number
	): Promise<PipelineResult> {
		const abortController = new AbortController();
		this.activeRequests.set(sessionId, abortController);
		const outputDir = this.resolveOutputDir(options, sessionId);
		const args = options.args;
		const cliOptions = {
			command: "generate-speech",
			outputDir,
			saveIntermediates: false,
			json: true,
			verbose: false,
			quiet: false,
			model: args.model as string | undefined,
			provider: args.provider as string | undefined,
			text: args.text as string | undefined,
			audioUrl: (args["audio-url"] ?? args.audio_url) as string | undefined,
			voice: args.voice as string | undefined,
			stability: args.stability as number | undefined,
			languageCode: (args["language-code"] ?? args.language_code) as
				| string
				| undefined,
			exaggeration: args.exaggeration as number | undefined,
			temperature: args.temperature as number | undefined,
			cfg: args.cfg as number | undefined,
			seed: args.seed as number | undefined,
		} satisfies Partial<CLIRunOptions>;

		try {
			const result = await handleGenerateSpeech(
				cliOptions as CLIRunOptions,
				onProgress,
				abortController.signal
			);
			const pipelineResult: PipelineResult = {
				...result,
				duration: result.duration ?? (Date.now() - startTime) / 1000,
			};
			return this.maybeAutoImport(options, pipelineResult);
		} finally {
			this.activeRequests.delete(sessionId);
		}
	}

	private async handleGenerateMusic(
		options: GenerateOptions,
		sessionId: string,
		onProgress: (progress: PipelineProgress) => void,
		startTime: number
	): Promise<PipelineResult> {
		const abortController = new AbortController();
		this.activeRequests.set(sessionId, abortController);
		const outputDir = this.resolveOutputDir(options, sessionId);
		const args = options.args;
		const cliOptions = {
			command: "generate-music",
			outputDir,
			saveIntermediates: false,
			json: true,
			verbose: false,
			quiet: false,
			model: args.model as string | undefined,
			provider: args.provider as string | undefined,
			text: (args.text ?? args.prompt) as string | undefined,
			lyrics: args.lyrics as string | undefined,
			instrumental: args.instrumental as boolean | undefined,
			sampleRate: (args["sample-rate"] ?? args.sample_rate) as
				| number
				| undefined,
			bitrate: args.bitrate as number | undefined,
			audioFormat: (args["audio-format"] ?? args.audio_format) as
				| string
				| undefined,
		} satisfies Partial<CLIRunOptions>;

		try {
			const result = await handleGenerateMusic(
				cliOptions as CLIRunOptions,
				onProgress,
				abortController.signal
			);
			const pipelineResult: PipelineResult = {
				...result,
				duration: result.duration ?? (Date.now() - startTime) / 1000,
			};
			return this.maybeAutoImport(options, pipelineResult);
		} finally {
			this.activeRequests.delete(sessionId);
		}
	}

	private async handleRunPipeline(
		options: GenerateOptions,
		sessionId: string,
		onProgress: (progress: PipelineProgress) => void,
		startTime: number
	): Promise<PipelineResult> {
		const configPath = options.args.config as string;
		if (!configPath) {
			return {
				success: false,
				error: "No pipeline config specified",
				errorCode: "generation_failed",
			};
		}

		let yamlContent: string;
		try {
			yamlContent = await fs.promises.readFile(configPath, "utf-8");
		} catch {
			return {
				success: false,
				error: `Cannot read config: ${configPath}`,
				errorCode: "generation_failed",
			};
		}

		const chain = parseChainConfig(yamlContent);
		const validation = validateChain(chain);
		if (!validation.valid) {
			return {
				success: false,
				error: `Pipeline validation failed: ${validation.errors.join("; ")}`,
				errorCode: "generation_failed",
			};
		}

		const abortController = new AbortController();
		this.activeRequests.set(sessionId, abortController);

		const outputDir = this.resolveOutputDir(options, sessionId);
		chain.config.outputDir = outputDir;

		const input =
			(options.args.text as string) || (options.args.input as string) || "";

		try {
			const result = await this.executor.executeChain(
				chain,
				input,
				(progress) => {
					onProgress({
						stage: progress.stage,
						percent: progress.percent,
						message: progress.message,
						model: progress.model,
						eta: progress.eta,
					});
				},
				abortController.signal
			);

			this.activeRequests.delete(sessionId);

			const pipelineResult: PipelineResult = {
				success: result.success,
				outputPath: result.outputPath,
				outputPaths: result.outputPaths,
				error: result.error,
				errorCode: result.success ? undefined : "generation_failed",
				duration: (Date.now() - startTime) / 1000,
				cost: result.totalCost,
				models: chain.steps.filter((s) => s.enabled).map((s) => s.model),
				data: { stepResults: result.stepResults },
			};

			if (pipelineResult.success) {
				return this.maybeAutoImport(options, pipelineResult);
			}
			return pipelineResult;
		} catch (err) {
			this.activeRequests.delete(sessionId);
			throw err;
		}
	}

	private async handleVimaxCommand(
		options: GenerateOptions,
		sessionId: string,
		onProgress: (progress: PipelineProgress) => void,
		startTime: number
	): Promise<PipelineResult> {
		const rawMaxScenes = options.args["max-scenes"]
			? parseInt(String(options.args["max-scenes"]), 10)
			: undefined;
		const rawMaxChars = options.args["max-characters"]
			? parseInt(String(options.args["max-characters"]), 10)
			: undefined;
		const rawRefStrength = options.args["reference-strength"]
			? parseFloat(String(options.args["reference-strength"]))
			: undefined;

		const cliOptions: CLIRunOptions = {
			command: options.command,
			outputDir: this.resolveOutputDir(options, sessionId),
			saveIntermediates: false,
			json: false,
			verbose: false,
			quiet: false,
			config: options.args.config as string | undefined,
			duration: options.args.duration as string | undefined,
			noReferences: options.args["no-references"] as boolean | undefined,
			projectId: options.projectId,
			text: options.args.text as string | undefined,
			idea: options.args.idea as string | undefined,
			script: options.args.script as string | undefined,
			novel: options.args.novel as string | undefined,
			input: options.args.input as string | undefined,
			title: options.args.title as string | undefined,
			imageModel: options.args["image-model"] as string | undefined,
			videoModel: options.args["video-model"] as string | undefined,
			llmModel: options.args["llm-model"] as string | undefined,
			maxScenes:
				rawMaxScenes != null && !Number.isNaN(rawMaxScenes)
					? rawMaxScenes
					: undefined,
			noPortraits: options.args["no-portraits"] as boolean | undefined,
			storyboardOnly: options.args["storyboard-only"] as boolean | undefined,
			scriptsOnly: options.args["scripts-only"] as boolean | undefined,
			portraits: options.args.portraits as string | undefined,
			views: options.args.views as string | undefined,
			maxCharacters:
				rawMaxChars != null && !Number.isNaN(rawMaxChars)
					? rawMaxChars
					: undefined,
			saveRegistry: options.args["save-registry"] as boolean | undefined,
			style: options.args.style as string | undefined,
			referenceModel: options.args["reference-model"] as string | undefined,
			referenceStrength:
				rawRefStrength != null && !Number.isNaN(rawRefStrength)
					? rawRefStrength
					: undefined,
		};

		const progressFn = (p: {
			stage: string;
			percent: number;
			message: string;
			model?: string;
		}) => {
			onProgress({ ...p, eta: undefined });
		};

		const vimaxHandlers: Record<
			string,
			(
				opts: CLIRunOptions,
				prog: typeof progressFn
			) => Promise<import("./cli/cli-runner.js").CLIResult>
		> = {
			"vimax:idea2video": handleVimaxIdea2Video,
			"vimax:script2video": handleVimaxScript2Video,
			"vimax:novel2movie": handleVimaxNovel2Movie,
			"vimax:extract-characters": handleVimaxExtractCharacters,
			"vimax:generate-script": handleVimaxGenerateScript,
			"vimax:generate-storyboard": handleVimaxGenerateStoryboard,
			"vimax:generate-portraits": handleVimaxGeneratePortraits,
		};

		const noProgressHandlers: Record<
			string,
			(opts: CLIRunOptions) => Promise<import("./cli/cli-runner.js").CLIResult>
		> = {
			"vimax:create-registry": handleVimaxCreateRegistry,
			"vimax:show-registry": handleVimaxShowRegistry,
		};

		let result: import("./cli/cli-runner.js").CLIResult;

		if (options.command === "vimax:list-models") {
			result = handleVimaxListModels();
		} else if (options.command in noProgressHandlers) {
			result = await noProgressHandlers[options.command](cliOptions);
		} else if (options.command in vimaxHandlers) {
			result = await vimaxHandlers[options.command](cliOptions, progressFn);
		} else {
			return {
				success: false,
				error: `Unknown vimax command: ${options.command}`,
				errorCode: "generation_failed",
			};
		}

		const pipelineResult: PipelineResult = {
			success: result.success,
			outputPath: result.outputPath,
			outputPaths: result.outputPaths,
			error: result.error,
			errorCode: result.success ? undefined : "generation_failed",
			duration: result.duration ?? (Date.now() - startTime) / 1000,
			cost: result.cost,
			data: result.data,
		};

		if (pipelineResult.success) {
			return this.maybeAutoImport(options, pipelineResult);
		}
		return pipelineResult;
	}

	cancel(sessionId: string): boolean {
		const controller = this.activeRequests.get(sessionId);
		if (controller) {
			controller.abort();
			this.activeRequests.delete(sessionId);
			console.log(`[NativePipeline] Cancelled session: ${sessionId}`);
			return true;
		}
		return false;
	}

	cancelAll(): void {
		for (const [sessionId, controller] of this.activeRequests) {
			controller.abort();
			console.log(`[NativePipeline] Cancelled session: ${sessionId}`);
		}
		this.activeRequests.clear();
	}

	getActiveCount(): number {
		return this.activeRequests.size;
	}

	async refreshEnvironment(): Promise<void> {
		// Native pipeline doesn't need environment refresh
		// Always available if API keys are configured
	}

	private resolveOutputDir(
		options: GenerateOptions,
		sessionId: string
	): string {
		return resolveOutputDirShared(
			options.outputDir,
			sessionId,
			app?.getPath("temp")
		);
	}

	private buildParams(
		args: Record<string, string | number | boolean>
	): Record<string, unknown> {
		const params: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(args)) {
			if (key === "model" || key === "no-json") continue;
			params[key.replace(/-/g, "_")] = value;
		}
		return params;
	}

	private buildStepInput(args: Record<string, string | number | boolean>): {
		text?: string;
		imageUrl?: string;
		videoUrl?: string;
		audioUrl?: string;
	} {
		return {
			text: args.text as string | undefined,
			imageUrl: (args["image-url"] || args.image_url) as string | undefined,
			videoUrl: (args["video-url"] || args.video_url) as string | undefined,
			audioUrl: (args["audio-url"] || args.audio_url) as string | undefined,
		};
	}

	private guessExtFromCommand(command: string): string {
		switch (command) {
			case "generate-image":
				return ".png";
			case "create-video":
			case "generate-avatar":
				return ".mp4";
			case "generate-music":
				return ".mp3";
			case "generate-speech":
				return ".wav";
			default:
				return ".bin";
		}
	}

	private async maybeAutoImport(
		options: GenerateOptions,
		result: PipelineResult
	): Promise<PipelineResult> {
		if (!result.success || !result.outputPath) return result;
		if (options.autoImport === false) return result;

		const projectId =
			options.projectId ||
			inferProjectIdFromPath({ filePath: result.outputPath });
		if (!projectId) return result;

		try {
			const importedMedia = await importMediaFile(projectId, result.outputPath);
			if (importedMedia) {
				return {
					...result,
					mediaId: importedMedia.id,
					importedPath: importedMedia.path,
				};
			}
			return {
				...result,
				importWarning: "Generation succeeded but import returned no media.",
			};
		} catch (err) {
			console.error("[NativePipeline] Auto-import failed:", err);
			return {
				...result,
				importWarning: "Generation succeeded but media import failed.",
			};
		}
	}
}
