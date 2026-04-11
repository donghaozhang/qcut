/**
 * CLI Pipeline Runner class — delegates to handler functions
 * via the HANDLER_MAP registry.
 *
 * @module electron/native-pipeline/cli/cli-runner/runner
 */

import { PipelineExecutor } from "../../execution/executor.js";
import {
	setApiKeyProvider,
	envApiKeyProvider,
} from "../../infra/api-caller.js";
import { loadEnvFile, getKey } from "../../infra/key-manager.js";
import { setSessionTokenProvider } from "../../infra/proxy-client.js";
import { readStdin } from "../interactive.js";
import { handleEditorCommand } from "../cli-handlers-editor.js";
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
import { HANDLER_MAP } from "./handler-map.js";
import { ModelRegistry } from "../../infra/registry.js";

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
		setSessionTokenProvider(async () => {
			return getKey("QCUT_AUTH_TOKEN") ?? "";
		});
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

		// Resolve --provider to --model if model not explicitly set
		if (resolvedOptions.provider && !resolvedOptions.model) {
			const match = ModelRegistry.findByProvider(resolvedOptions.provider);
			if (match) {
				resolvedOptions = { ...resolvedOptions, model: match.key };
			} else {
				return {
					success: false,
					error: `Unknown provider '${resolvedOptions.provider}'. Use 'qcut system models --json' to list available providers.`,
				};
			}
		}

		let result: CLIResult;
		const handler = HANDLER_MAP[resolvedOptions.command];
		if (handler) {
			result = await handler(
				resolvedOptions,
				onProgress,
				this.executor,
				this.signal
			);
		} else if (resolvedOptions.command.startsWith("editor:")) {
			result = await handleEditorCommand(
				resolvedOptions,
				onProgress,
				this.signal
			);
		} else {
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
