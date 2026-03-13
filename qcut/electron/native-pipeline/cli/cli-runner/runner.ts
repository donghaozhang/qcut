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
import { resolveActionPolicy, evaluateActionPolicy } from "../action-policy.js";
import { confirm, isInteractive } from "../interactive.js";
import {
	applySessionStateToOptions,
	createEmptySessionState,
	loadSessionState,
	saveSessionState,
	updateSessionState,
	type SessionState,
} from "../session-state.js";
import { handleGenerate } from "./handler-generate.js";
import { handleRunPipeline } from "./handler-pipeline.js";
import { handleTransferMotion } from "./handler-transfer.js";
import { handleGenerateGrid } from "./handler-grid.js";
import { handleUpscaleImage } from "./handler-upscale.js";
import { handlePipelineStatus } from "./handler-pipeline-status.js";
import {
	handleGenerateSpeech,
	handleConvertSpeech,
	handleCloneVoice,
} from "../cli-handlers-speech.js";
import {
	handleSubtitleStyle,
	handleSubtitleExport,
} from "../cli-handlers-subtitle.js";

async function enforceActionPolicy({
	options,
}: {
	options: CLIRunOptions;
}): Promise<CLIResult | null> {
	try {
		const { policy, source } = resolveActionPolicy({
			policyPath: options.policy,
		});
		const evaluation = evaluateActionPolicy({
			options,
			policy,
		});

		if (evaluation.decision === "deny") {
			const sourceHint =
				source === "file" && options.policy
					? ` from ${options.policy}`
					: " from the default policy";
			const patternHint = evaluation.matchedPattern
				? ` (matched '${evaluation.matchedPattern}')`
				: "";
			return {
				success: false,
				error: `Command blocked by action policy${sourceHint}${patternHint}: ${options.command}`,
			};
		}

		if (evaluation.decision !== "confirm") {
			return null;
		}

		if (options.force) {
			return null;
		}

		const patternHint = evaluation.matchedPattern
			? ` (matched '${evaluation.matchedPattern}')`
			: "";
		if (!isInteractive()) {
			return {
				success: false,
				error: `Command requires confirmation by action policy${patternHint}: ${options.command}. Re-run with --force or allow it via --policy <path>.`,
			};
		}

		const proceed = await confirm(
			`Action policy requires confirmation for '${options.command}'${patternHint}. Proceed?`
		);
		if (!proceed) {
			return {
				success: false,
				error: "Execution cancelled by action policy confirmation",
			};
		}

		return null;
	} catch (error) {
		return {
			success: false,
			error: `Failed to load action policy: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
}

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

		let activeSessionState: SessionState | null = null;
		let resolvedOptions = options;

		if (options.resume) {
			try {
				activeSessionState =
					loadSessionState({
						sessionName: options.resume,
						stateDir: options.stateDir,
					}) ?? createEmptySessionState({ sessionName: options.resume });
				resolvedOptions = applySessionStateToOptions({
					options,
					sessionState: activeSessionState,
				});
			} catch (error) {
				return {
					success: false,
					error: `Failed to load session state: ${
						error instanceof Error ? error.message : String(error)
					}`,
				};
			}
		}

		if (resolvedOptions.input === "-") {
			try {
				resolvedOptions = {
					...resolvedOptions,
					input: await readStdin(),
				};
			} catch (err) {
				return {
					success: false,
					error: `Failed to read stdin: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		}

		const policyResult = await enforceActionPolicy({
			options: resolvedOptions,
		});
		if (policyResult) {
			return policyResult;
		}

		let result: CLIResult;
		switch (resolvedOptions.command) {
			case "list-models":
				result = await adminHandleListModels(resolvedOptions);
				break;
			case "estimate-cost":
				result = await adminHandleEstimateCost(resolvedOptions);
				break;
			case "generate-image":
			case "create-video":
			case "generate-avatar":
				result = await handleGenerate(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "run-pipeline":
				result = await handleRunPipeline(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "analyze-video":
				result = await mediaHandleAnalyzeVideo(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "query-video":
				result = await mediaHandleQueryVideo(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "transcribe":
				result = await mediaHandleTranscribe(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "generate-remotion":
				result = await handleGenerateRemotion(
					resolvedOptions,
					onProgress,
					null,
					this.signal
				);
				break;
			case "moyin:parse-script":
				result = await handleMoyinParseScript(resolvedOptions, onProgress);
				break;
			case "transfer-motion":
				result = await handleTransferMotion(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "generate-grid":
				result = await handleGenerateGrid(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "upscale-image":
				result = await handleUpscaleImage(
					resolvedOptions,
					onProgress,
					this.executor,
					this.signal
				);
				break;
			case "setup":
				result = await adminHandleSetup();
				break;
			case "set-key":
				result = await adminHandleSetKey(resolvedOptions);
				break;
			case "get-key":
				result = await adminHandleGetKey(resolvedOptions);
				break;
			case "check-keys":
				result = await adminHandleCheckKeys();
				break;
			case "delete-key":
				result = await adminHandleDeleteKey(resolvedOptions);
				break;
			case "init-project":
				result = await adminHandleInitProject(resolvedOptions);
				break;
			case "organize-project":
				result = await adminHandleOrganizeProject(resolvedOptions);
				break;
			case "structure-info":
				result = await adminHandleStructureInfo(resolvedOptions);
				break;
			case "create-examples":
				result = await adminHandleCreateExamples(resolvedOptions);
				break;
			case "vimax:idea2video":
				result = await handleVimaxIdea2Video(resolvedOptions, onProgress);
				break;
			case "vimax:script2video":
				result = await handleVimaxScript2Video(resolvedOptions, onProgress);
				break;
			case "vimax:novel2movie":
				result = await handleVimaxNovel2Movie(resolvedOptions, onProgress);
				break;
			case "vimax:extract-characters":
				result = await handleVimaxExtractCharacters(
					resolvedOptions,
					onProgress
				);
				break;
			case "vimax:generate-script":
				result = await handleVimaxGenerateScript(resolvedOptions, onProgress);
				break;
			case "vimax:generate-storyboard":
				result = await handleVimaxGenerateStoryboard(
					resolvedOptions,
					onProgress
				);
				break;
			case "vimax:generate-portraits":
				result = await handleVimaxGeneratePortraits(
					resolvedOptions,
					onProgress
				);
				break;
			case "vimax:create-registry":
				result = await handleVimaxCreateRegistry(resolvedOptions);
				break;
			case "vimax:show-registry":
				result = await handleVimaxShowRegistry(resolvedOptions);
				break;
			case "vimax:list-models":
				result = await handleVimaxListModels();
				break;
			case "list-avatar-models":
				result = await adminHandleListModels({
					...resolvedOptions,
					category: "avatar",
				});
				break;
			case "list-video-models":
				result = await adminHandleListModels({
					...resolvedOptions,
					category: "text_to_video",
				});
				break;
			case "list-motion-models":
				result = await adminHandleListModels({
					...resolvedOptions,
					category: "motion_transfer",
				});
				break;
			case "list-speech-models":
				result = await adminHandleListModels({
					...resolvedOptions,
					category: "text_to_speech",
				});
				break;
			case "pipeline:status":
				result = await handlePipelineStatus(resolvedOptions);
				break;
			case "translate-video":
				result = await handleTranslateVideo(
					resolvedOptions,
					onProgress,
					this.signal
				);
				break;
			case "generate-speech":
				result = await handleGenerateSpeech(
					resolvedOptions,
					onProgress,
					this.signal
				);
				break;
			case "convert-speech":
				result = await handleConvertSpeech(
					resolvedOptions,
					onProgress,
					this.signal
				);
				break;
			case "clone-voice":
				result = await handleCloneVoice(
					resolvedOptions,
					onProgress,
					this.signal
				);
				break;
			case "youtube:upload":
				result = await handleYouTubeUpload(resolvedOptions, onProgress);
				break;
			case "subtitle-style":
				result = await handleSubtitleStyle(
					resolvedOptions,
					onProgress,
				);
				break;
			case "subtitle-export":
				result = await handleSubtitleExport(
					resolvedOptions,
					onProgress,
					this.signal,
				);
				break;
			case "autoclip":
				result = await runAutoclip(
					parseAutoclipOptions(resolvedOptions),
					onProgress,
					this.signal
				);
				break;
			default:
				if (resolvedOptions.command.startsWith("editor:")) {
					result = await handleEditorCommand(
						resolvedOptions,
						onProgress,
						this.signal
					);
					break;
				}
				result = {
					success: false,
					error: `Unknown command: ${resolvedOptions.command}`,
				};
		}

		if (resolvedOptions.resume && activeSessionState) {
			try {
				const nextState = updateSessionState({
					sessionState: activeSessionState,
					options: resolvedOptions,
					result,
				});
				saveSessionState({
					sessionState: nextState,
					stateDir: resolvedOptions.stateDir,
				});
			} catch (error) {
				if (!resolvedOptions.quiet) {
					console.error(
						`[QCut CLI] Failed to save session state '${resolvedOptions.resume}': ${
							error instanceof Error ? error.message : String(error)
						}`
					);
				}
			}
		}

		return result;
	}
}
