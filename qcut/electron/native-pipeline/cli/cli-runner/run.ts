/**
 * Unified run(command) entrypoint for programmatic CLI invocation.
 *
 * Reduces invocation complexity for agents — one entrypoint, direct
 * command construction, no tool-schema overhead.
 *
 * @module electron/native-pipeline/cli/cli-runner/run
 */

import { CLIPipelineRunner } from "./runner.js";
import { parseSessionLine } from "./session.js";
import { createProgressReporter } from "./progress.js";
import type { CLIResult, CLIRunOptions, ProgressFn } from "./types.js";
import { generateCommandId } from "./types.js";
import { getExitCode, ExitCode } from "../../output/errors.js";
import { initRegistry } from "../../init.js";

export interface RunResult extends CLIResult {
	exit_code: number;
	duration_ms: number;
	command_id: string;
}

/**
 * Run a single CLI command string and return a structured result.
 *
 * @param command - Full command string (e.g. "generate-image -t 'A cat' --model flux")
 * @param baseOptions - Optional base options (host, port, json, etc.)
 * @param onProgress - Optional progress callback
 */
export async function run(
	command: string,
	baseOptions: Partial<CLIRunOptions> = {},
	onProgress?: ProgressFn
): Promise<RunResult> {
	initRegistry();

	const commandId = generateCommandId();
	const start = performance.now();

	const opts = parseSessionLine(command, baseOptions);
	if (!opts) {
		return {
			success: false,
			error: `Invalid or empty command: ${command.split(/\s/)[0] ?? "(empty)"}`,
			exit_code: ExitCode.INVALID_ARGS,
			duration_ms: Math.round(performance.now() - start),
			command_id: commandId,
		};
	}

	opts.commandId = commandId;

	const runner = new CLIPipelineRunner();
	const reporter =
		onProgress ??
		createProgressReporter({
			json: opts.json,
			quiet: opts.quiet,
		});

	try {
		const result = await runner.run(opts, reporter);
		const durationMs = Math.round(performance.now() - start);
		const exitCode = result.success ? ExitCode.SUCCESS : ExitCode.GENERAL_ERROR;

		return {
			...result,
			exit_code: exitCode,
			duration_ms: durationMs,
			command_id: commandId,
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		const exitCode = getExitCode(err);
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			exit_code: exitCode,
			duration_ms: durationMs,
			command_id: commandId,
		};
	}
}

/**
 * Run a sequence of CLI commands, optionally piping output paths.
 *
 * Stops on first failure unless continueOnError is true.
 * When a command produces an outputPath, the next command receives
 * it as --input (if not already specified).
 */
export async function runChain(
	commands: string[],
	options: {
		baseOptions?: Partial<CLIRunOptions>;
		onProgress?: ProgressFn;
		continueOnError?: boolean;
	} = {}
): Promise<RunResult[]> {
	const results: RunResult[] = [];
	let lastOutputPath: string | undefined;

	for (const command of commands) {
		let effectiveCommand = command;

		// Pipe previous output as input if the command doesn't specify --input
		if (lastOutputPath && !/(?:^|\s)(?:--input|-i)(?:\s|=|$)/.test(command)) {
			effectiveCommand = `${command} --input "${lastOutputPath}"`;
		}

		const result = await run(
			effectiveCommand,
			options.baseOptions,
			options.onProgress
		);
		results.push(result);

		if (result.success && result.outputPath) {
			lastOutputPath = result.outputPath;
		} else {
			lastOutputPath = undefined;
		}

		if (!result.success && !options.continueOnError) {
			break;
		}
	}

	return results;
}
