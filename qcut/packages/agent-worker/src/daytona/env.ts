import type { AgentJob } from "@qcut/db";

import {
	buildCodexPromptEnv,
	getCodexPrompt,
	isCodexAgentCommand,
} from "../run-container.js";
import type { AgentSecretRow } from "./types.js";

export function buildDaytonaEnv({
	secrets,
	job,
}: {
	secrets: AgentSecretRow[];
	job?: AgentJob;
}): Record<string, string> {
	const env: Record<string, string> = { QCUT_SESSION_ROLE: "agent" };
	for (const secret of secrets) env[secret.key] = secret.value;
	if (job && isCodexAgentCommand({ command: job.command })) {
		Object.assign(
			env,
			buildCodexPromptEnv({ prompt: getCodexPrompt({ args: job.args }) })
		);
	}
	return env;
}
