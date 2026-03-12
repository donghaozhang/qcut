import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";
import {
	buildSessionStateSnapshot,
	getSessionStatePath,
	loadSessionState,
	saveSessionState,
} from "./session-state.js";

function resolveSessionName({
	options,
	action,
}: {
	options: CLIRunOptions;
	action: string;
}): string | null {
	if (options.sessionName) {
		return options.sessionName;
	}
	if (action === "save" && options.resume) {
		return options.resume;
	}
	return null;
}

export async function handleSessionCommand({
	options,
}: {
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	const sessionName = resolveSessionName({ options, action });

	switch (action) {
		case "save": {
			if (!sessionName) {
				return {
					success: false,
					error:
						"Session save requires --session-name <name> or an active --resume session",
				};
			}

			const existingState =
				loadSessionState({
					sessionName,
					stateDir: options.stateDir,
				}) ?? undefined;
			const sessionState = buildSessionStateSnapshot({
				sessionName,
				options,
				existingState,
			});
			saveSessionState({
				sessionState,
				stateDir: options.stateDir,
			});

			return {
				success: true,
				data: {
					session: sessionState,
					path: getSessionStatePath({
						sessionName,
						stateDir: options.stateDir,
					}),
					existed: existingState !== undefined,
				},
			};
		}
		case "load": {
			if (!sessionName) {
				return {
					success: false,
					error: "Session load requires --session-name <name>",
				};
			}

			const sessionState = loadSessionState({
				sessionName,
				stateDir: options.stateDir,
			});
			if (!sessionState) {
				return {
					success: false,
					error: `Saved session not found: ${sessionName}`,
				};
			}

			return {
				success: true,
				data: {
					session: sessionState,
					path: getSessionStatePath({
						sessionName,
						stateDir: options.stateDir,
					}),
					existed: true,
				},
			};
		}
		default:
			return {
				success: false,
				error: `Unknown session action: ${action}. Available: save, load`,
			};
	}
}
