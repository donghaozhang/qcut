/**
 * CLI Pipeline Runner class — delegates to handler functions.
 * @module electron/native-pipeline/cli/cli-runner/runner
 */

import { PipelineExecutor } from "../../execution/executor.js";
import {
	setApiKeyProvider,
	envApiKeyProvider,
} from "../../infra/api-caller.js";
import { loadEnvFile } from "../../infra/key-manager.js";
import { readStdin } from "../interactive.js";
import {
	handleAnalyzeVideo as mediaHandleAnalyzeVideo,
	handleTranscribe as mediaHandleTranscribe,
	handleQueryVideo as mediaHandleQueryVideo,
} from "../cli-handlers-media.js";
import { handleGenerateRemotion } from "../cli-handlers-remotion.js";
import { handleMoyinParseScript } from "../cli-handlers-moyin.js";
import {
	handleSetup as adminHandleSetup,
	handleSetKey as adminHandleSetKey,
	handleGetKey as adminHandleGetKey,
	handleCheckKeys as adminHandleCheckKeys,
	handleDeleteKey as adminHandleDeleteKey,
	handleInitProject as adminHandleInitProject,
	handleOrganizeProject as adminHandleOrganizeProject,
	handleStructureInfo as adminHandleStructureInfo,
	handleCreateExamples as adminHandleCreateExamples,
	handleListModels as adminHandleListModels,
	handleEstimateCost as adminHandleEstimateCost,
} from "../cli-handlers-admin.js";
import { handleEditorCommand } from "../cli-handlers-editor.js";
import {
	handleVimaxExtractCharacters,
	handleVimaxGenerateScript,
	handleVimaxGenerateStoryboard,
	handleVimaxGeneratePortraits,
	handleVimaxCreateRegistry,
	handleVimaxShowRegistry,
	handleVimaxListModels,
	handleVimaxIdea2Video,
	handleVimaxScript2Video,
	handleVimaxNovel2Movie,
} from "../vimax-cli-handlers.js";
import { handleYouTubeUpload } from "../cli-handlers-youtube.js";
import { handleTranslateVideo } from "../cli-handlers-translate.js";
import {
	runAutoclip,
	parseAutoclipOptions,
} from "../../autoclip/autoclip-runner.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";
import { handleGenerate } from "./handler-generate.js";
import { handleRunPipeline } from "./handler-pipeline.js";
import { handleTransferMotion } from "./handler-transfer.js";
import { handleGenerateGrid } from "./handler-grid.js";
import { handleUpscaleImage } from "./handler-upscale.js";
import { handlePipelineStatus } from "./handler-pipeline-status.js";

export class CLIPipelineRunner {
	private executor = new PipelineExecutor();
	private abortController = new AbortController();

	constructor() {
		setApiKeyProvider(envApiKeyProvider);
	}

	get signal(): AbortSignal {
		return this.abortController.signal;
	}

	abort(): void {
		this.abortController.abort();
	}

	async run(
		options: CLIRunOptions,
		onProgress: ProgressFn
	): Promise<CLIResult> {
		loadEnvFile(options.configDir);

		if (options.input === "-") {
			try {
				options.input = await readStdin();
			} catch (err) {
				return {
					success: false,
					error: `Failed to read stdin: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}

		switch (options.command) {
			case "list-models":
				return adminHandleListModels(options);
			case "estimate-cost":
				return adminHandleEstimateCost(options);
			case "generate-image":
			case "create-video":
			case "generate-avatar":
				return handleGenerate(options, onProgress, this.executor, this.signal);
			case "run-pipeline":
				return handleRunPipeline(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "analyze-video":
				return mediaHandleAnalyzeVideo(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "query-video":
				return mediaHandleQueryVideo(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "transcribe":
				return mediaHandleTranscribe(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "generate-remotion":
				return handleGenerateRemotion(options, onProgress, null, this.signal);
			case "moyin:parse-script":
				return handleMoyinParseScript(options, onProgress);
			case "transfer-motion":
				return handleTransferMotion(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "generate-grid":
				return handleGenerateGrid(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "upscale-image":
				return handleUpscaleImage(
					options,
					onProgress,
					this.executor,
					this.signal
				);
			case "setup":
				return adminHandleSetup();
			case "set-key":
				return adminHandleSetKey(options);
			case "get-key":
				return adminHandleGetKey(options);
			case "check-keys":
				return adminHandleCheckKeys();
			case "delete-key":
				return adminHandleDeleteKey(options);
			case "init-project":
				return adminHandleInitProject(options);
			case "organize-project":
				return adminHandleOrganizeProject(options);
			case "structure-info":
				return adminHandleStructureInfo(options);
			case "create-examples":
				return adminHandleCreateExamples(options);
			case "vimax:idea2video":
				return handleVimaxIdea2Video(options, onProgress);
			case "vimax:script2video":
				return handleVimaxScript2Video(options, onProgress);
			case "vimax:novel2movie":
				return handleVimaxNovel2Movie(options, onProgress);
			case "vimax:extract-characters":
				return handleVimaxExtractCharacters(options, onProgress);
			case "vimax:generate-script":
				return handleVimaxGenerateScript(options, onProgress);
			case "vimax:generate-storyboard":
				return handleVimaxGenerateStoryboard(options, onProgress);
			case "vimax:generate-portraits":
				return handleVimaxGeneratePortraits(options, onProgress);
			case "vimax:create-registry":
				return handleVimaxCreateRegistry(options);
			case "vimax:show-registry":
				return handleVimaxShowRegistry(options);
			case "vimax:list-models":
				return handleVimaxListModels();
			case "list-avatar-models":
				return adminHandleListModels({ ...options, category: "avatar" });
			case "list-video-models":
				return adminHandleListModels({
					...options,
					category: "text_to_video",
				});
			case "list-motion-models":
				return adminHandleListModels({
					...options,
					category: "motion_transfer",
				});
			case "list-speech-models":
				return adminHandleListModels({
					...options,
					category: "text_to_speech",
				});
			case "pipeline:status":
				return handlePipelineStatus(options);
			case "translate-video":
				return handleTranslateVideo(options, onProgress, this.signal);
			case "youtube:upload":
				return handleYouTubeUpload(options, onProgress);
			case "autoclip":
				return runAutoclip(
					parseAutoclipOptions(options),
					onProgress,
					this.signal
				);
			default:
				if (options.command.startsWith("editor:")) {
					return handleEditorCommand(options, onProgress, this.signal);
				}
				return { success: false, error: `Unknown command: ${options.command}` };
		}
	}
}
