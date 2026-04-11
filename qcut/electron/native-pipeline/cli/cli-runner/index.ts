/**
 * CLI Pipeline Runner — barrel re-exports.
 * @module electron/native-pipeline/cli/cli-runner
 */

export { CLIPipelineRunner } from "./runner.js";
export {
	generateCommandId,
	type CLIRunOptions,
	type CLIResult,
	type ProgressFn,
} from "./types.js";
export {
	createProgressReporter,
	guessExtFromCommand,
	renderProgressBar,
} from "./progress.js";
export {
	runSession,
	parseSessionLine,
	getSessionClient,
	resetSessionState,
} from "./session.js";
export { run, runChain, type RunResult } from "./run.js";
export { HANDLER_MAP, type CommandHandler } from "./handler-map.js";
