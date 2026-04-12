/**
 * Handler Registry Map — maps command names to handler functions.
 *
 * Replaces the monolithic switch statement in runner.ts with a
 * typed lookup table. Handler functions are unchanged; only the
 * dispatch mechanism is different.
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-map
 */

import type { PipelineExecutor } from "../../execution/executor.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";

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
	handleLogin as adminHandleLogin,
	handleSignup as adminHandleSignup,
	handleLogout as adminHandleLogout,
	handleInitProject as adminHandleInitProject,
	handleOrganizeProject as adminHandleOrganizeProject,
	handleStructureInfo as adminHandleStructureInfo,
	handleCreateExamples as adminHandleCreateExamples,
	handleListModels as adminHandleListModels,
	handleEstimateCost as adminHandleEstimateCost,
} from "../cli-handlers-admin.js";
import {
	handleCreateElement as elementHandleCreate,
	handleListElements as elementHandleList,
	handleDeleteElement as elementHandleDelete,
} from "../cli-handlers-element.js";
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
import { handleStampImage } from "../cli-handlers-stamp.js";
import { handleYouTubeUpload } from "../cli-handlers-youtube.js";
import { handleTranslateVideo } from "../cli-handlers-translate.js";
import {
	handlePhotaEdit,
	handlePhotaEnhance,
	handlePhotaCreateProfile,
} from "../cli-handlers-phota.js";
import {
	runAutoclip,
	parseAutoclipOptions,
} from "../../autoclip/autoclip-runner.js";
import {
	runCleanAudio,
	parseCleanAudioOptions,
} from "../../autoclip/clean-audio-runner.js";
import { handleGenerate } from "./handler-generate.js";
import { handleRunPipeline } from "./handler-pipeline.js";
import { handleTransferMotion } from "./handler-transfer.js";
import { handleGenerateGrid } from "./handler-grid.js";
import { handleUpscaleImage, handleUpscaleVideo } from "./handler-upscale.js";
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
import {
	handleReplicate,
	handleReplicateAnalyze,
	handleReplicateGenerate,
} from "../cli-handlers-replicate.js";
import { handleGenerateMusic } from "../cli-handlers-music.js";
import { handleRecord } from "../cli-handlers-record.js";
import { handleRecordDaemon } from "../cli-handlers-record-daemon.js";

/**
 * Unified handler signature.
 * Handlers that don't need all params simply ignore them.
 */
export type CommandHandler = (
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
) => Promise<CLIResult>;

/** Wrap a handler that only needs options. */
function wrap(
	fn: (options: CLIRunOptions) => CLIResult | Promise<CLIResult>
): CommandHandler {
	return async (options) => fn(options);
}

/** Wrap a handler that takes no args. */
function wrap0(fn: () => CLIResult | Promise<CLIResult>): CommandHandler {
	return async () => fn();
}

/** Wrap a handler that takes (options, progress). */
function wrapOP(
	fn: (options: CLIRunOptions, onProgress: ProgressFn) => Promise<CLIResult>
): CommandHandler {
	return async (options, onProgress) => fn(options, onProgress);
}

/** Wrap a handler that takes (options, progress, signal). */
function wrapOPS(
	fn: (
		options: CLIRunOptions,
		onProgress: ProgressFn,
		signal: AbortSignal
	) => Promise<CLIResult>
): CommandHandler {
	return async (options, onProgress, _executor, signal) =>
		fn(options, onProgress, signal);
}

/**
 * Map of command names to handler functions.
 * Editor commands (editor:*) are NOT in this map — they use
 * the handleEditorCommand dispatcher via wildcard fallback.
 */
export const HANDLER_MAP: Record<string, CommandHandler> = {
	// ── Generation ──
	"generate-image": async (options, onProgress, executor, signal) =>
		options.grid
			? handleGenerateGrid(
					{ ...options, layout: options.grid as string },
					onProgress,
					executor,
					signal
				)
			: handleGenerate(options, onProgress, executor, signal),
	"create-video": handleGenerate,
	"generate-avatar": handleGenerate,
	"generate-grid": handleGenerateGrid,
	"transfer-motion": handleTransferMotion,
	"upscale-image": handleUpscaleImage,
	"upscale-video": handleUpscaleVideo,
	"generate-remotion": async (options, onProgress, _executor, signal) =>
		handleGenerateRemotion(options, onProgress, null, signal),
	"stamp-image": wrapOP(handleStampImage),
	"generate-music": wrapOPS(handleGenerateMusic),
	// ── Standalone screen recording ──
	record: wrapOPS(handleRecord),
	"record-daemon": wrapOPS(handleRecordDaemon),

	// ── Analysis ──
	"analyze-video": mediaHandleAnalyzeVideo,
	"query-video": mediaHandleQueryVideo,
	"transcribe": mediaHandleTranscribe,

	// ── Pipeline ──
	"run-pipeline": handleRunPipeline,
	"pipeline:status": wrap(handlePipelineStatus),

	// ── Auth & Keys ──
	"login": wrap(adminHandleLogin),
	"signup": wrap(adminHandleSignup),
	"logout": wrap0(adminHandleLogout),
	"setup": wrap0(adminHandleSetup),
	"set-key": wrap(adminHandleSetKey),
	"get-key": wrap(adminHandleGetKey),
	"check-keys": wrap0(adminHandleCheckKeys),
	"delete-key": wrap(adminHandleDeleteKey),

	// ── Project ──
	"init-project": wrap(adminHandleInitProject),
	"organize-project": wrap(adminHandleOrganizeProject),
	"structure-info": wrap(adminHandleStructureInfo),
	"create-examples": wrap(adminHandleCreateExamples),

	// ── Models ──
	"list-models": wrap(adminHandleListModels),
	"estimate-cost": wrap(adminHandleEstimateCost),
	"list-avatar-models": wrap((opts) =>
		adminHandleListModels({ ...opts, category: "avatar" })
	),
	"list-video-models": wrap((opts) =>
		adminHandleListModels({ ...opts, category: "text_to_video" })
	),
	"list-motion-models": wrap((opts) =>
		adminHandleListModels({ ...opts, category: "motion_transfer" })
	),
	"list-speech-models": wrap((opts) =>
		adminHandleListModels({ ...opts, category: "text_to_speech" })
	),

	// ── Elements (Kling) ──
	"create-element": wrapOP(elementHandleCreate),
	"list-elements": wrap0(elementHandleList),
	"delete-element": wrap(elementHandleDelete),

	// ── ViMax ──
	"vimax:idea2video": wrapOP(handleVimaxIdea2Video),
	"vimax:script2video": wrapOP(handleVimaxScript2Video),
	"vimax:novel2movie": wrapOP(handleVimaxNovel2Movie),
	"vimax:extract-characters": wrapOP(handleVimaxExtractCharacters),
	"vimax:generate-script": wrapOP(handleVimaxGenerateScript),
	"vimax:generate-storyboard": wrapOP(handleVimaxGenerateStoryboard),
	"vimax:generate-portraits": wrapOP(handleVimaxGeneratePortraits),
	"vimax:create-registry": wrap(handleVimaxCreateRegistry),
	"vimax:show-registry": wrap(handleVimaxShowRegistry),
	"vimax:list-models": wrap0(handleVimaxListModels),

	// ── Moyin ──
	"moyin:parse-script": wrapOP(handleMoyinParseScript),

	// ── Speech ──
	"generate-speech": wrapOPS(handleGenerateSpeech),
	"convert-speech": wrapOPS(handleConvertSpeech),
	"clone-voice": wrapOPS(handleCloneVoice),

	// ── Translate ──
	"translate-video": wrapOPS(handleTranslateVideo),

	// ── Phota ──
	"phota:edit": wrapOPS(handlePhotaEdit),
	"phota:enhance": wrapOPS(handlePhotaEnhance),
	"phota:profile": wrapOPS(handlePhotaCreateProfile),

	// ── YouTube ──
	"youtube:upload": wrapOP(handleYouTubeUpload),

	// ── Subtitle ──
	"subtitle-style": wrapOP(handleSubtitleStyle),
	"subtitle-export": wrapOPS(handleSubtitleExport),

	// ── Autoclip ──
	"autoclip": async (options, onProgress, _executor, signal) =>
		runAutoclip(parseAutoclipOptions(options), onProgress, signal),
	"clean-audio": async (options, onProgress, _executor, signal) =>
		runCleanAudio(parseCleanAudioOptions(options), onProgress, signal),

	// ── Replicate ──
	"replicate": wrapOPS(handleReplicate),
	"replicate:analyze": wrapOPS(handleReplicateAnalyze),
	"replicate:generate": wrapOPS(handleReplicateGenerate),
};
