/**
 * CLI bridge — in-process wrapper around CLIPipelineRunner.
 *
 * Uses the existing runner directly instead of spawning child_process,
 * avoiding binary packaging issues and reusing the API key provider chain.
 *
 * @module electron/pi-agent/cli-bridge
 */

import { initRegistry } from "../native-pipeline/init.js";
import { CLIPipelineRunner } from "../native-pipeline/cli/cli-runner/runner.js";
import type { CLIRunOptions, CLIResult } from "../native-pipeline/cli/cli-runner/types.js";

let runner: CLIPipelineRunner | null = null;

/** Get or create a shared runner instance. */
function getRunner(): CLIPipelineRunner {
	if (!runner) {
		initRegistry();
		runner = new CLIPipelineRunner();
	}
	return runner;
}

/**
 * Execute a QCut CLI command in-process.
 *
 * @param command  Command name, e.g. "generate-image" or "editor:timeline-split"
 * @param args     Flag key/value pairs, e.g. { text: "hello", model: "flux_dev" }
 * @param timeout  Max execution time in ms (default 60 000)
 * @returns        JSON-serialisable result
 */
export async function execCli(
	command: string,
	args: Record<string, unknown> = {},
	timeout = 60_000
): Promise<CLIResult> {
	const r = getRunner();

	const options: Partial<CLIRunOptions> = {
		command,
		json: true,
		...args,
	};

	const noopProgress = () => {};

	const timeoutPromise = new Promise<CLIResult>((_, reject) =>
		setTimeout(() => reject(new Error(`CLI command "${command}" timed out after ${timeout}ms`)), timeout)
	);

	try {
		const result = await Promise.race([
			r.run(options as CLIRunOptions, noopProgress),
			timeoutPromise,
		]);
		return result;
	} catch (error: any) {
		return {
			success: false,
			error: error.message ?? String(error),
		};
	}
}

/**
 * Execute a CLI command and return the result as a JSON string
 * suitable for tool result content.
 */
export async function execCliJson(
	command: string,
	args: Record<string, unknown> = {}
): Promise<string> {
	const result = await execCli(command, args);
	return JSON.stringify(result);
}
