#!/usr/bin/env node

import { Command } from "commander";
import { registerInit } from "./commands/init.js";

const program = new Command();

program
	.name("qagent")
	.description("Agent Orchestrator — manage parallel AI coding agents")
	.version("0.1.0");

// init has no @composio/ao-core dependency — always available
registerInit(program);

/**
 * Dynamically load command modules that depend on @composio/ao-core.
 * If ao-core isn't installed (e.g. workspace resolution fails), these
 * commands are skipped gracefully so the CLI can still start.
 */
async function registerOptionalCommands(prog: Command): Promise<void> {
	const commands: Array<{
		module: string;
		fns: string[];
	}> = [
		{ module: "./commands/start.js", fns: ["registerStart", "registerStop"] },
		{ module: "./commands/status.js", fns: ["registerStatus"] },
		{
			module: "./commands/spawn.js",
			fns: ["registerSpawn", "registerBatchSpawn"],
		},
		{ module: "./commands/session.js", fns: ["registerSession"] },
		{ module: "./commands/send.js", fns: ["registerSend"] },
		{ module: "./commands/review-check.js", fns: ["registerReviewCheck"] },
		{ module: "./commands/dashboard.js", fns: ["registerDashboard"] },
		{ module: "./commands/open.js", fns: ["registerOpen"] },
		{ module: "./commands/pr-comments.js", fns: ["registerPRComments"] },
		{ module: "./commands/policy.js", fns: ["registerPolicy"] },
		{ module: "./commands/team.js", fns: ["registerTeam"] },
		{ module: "./commands/harness.js", fns: ["registerHarness"] },
	];

	const skipped: string[] = [];

	for (const { module: modPath, fns } of commands) {
		try {
			const mod = await import(modPath);
			for (const fn of fns) {
				if (typeof mod[fn] === "function") {
					mod[fn](prog);
				}
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			const isModuleNotFound =
				message.includes("Cannot find package") ||
				message.includes("ERR_MODULE_NOT_FOUND");

			if (isModuleNotFound) {
				skipped.push(
					modPath.replace("./commands/", "").replace(".js", "")
				);
				continue;
			}

			throw error;
		}
	}

	if (skipped.length > 0) {
		const names = skipped.join(", ");
		console.error(
			`Warning: some commands unavailable (missing @composio/ao-core): ${names}`
		);
	}
}

registerOptionalCommands(program)
	.then(() => program.parse())
	.catch((error) => {
		console.error(
			`Failed to initialize CLI: ${error instanceof Error ? error.message : String(error)}`
		);
		process.exit(1);
	});
