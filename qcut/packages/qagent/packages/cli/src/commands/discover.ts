/**
 * `qagent discover [project]` — manual one-shot issue discovery.
 *
 * Scans the configured tracker for issues matching the autoDiscovery config
 * and spawns agent sessions for new ones. Useful for testing and manual triggers.
 */

import chalk from "chalk";
import type { Command } from "commander";
import {
	loadConfig,
	discoverAndSpawn,
	resolveAutoDiscoveryConfig,
	type IssueDiscoveryDeps,
	type OrchestratorEvent,
	type EventPriority,
} from "@composio/ao-core";
import { getSessionManager, getPluginRegistry } from "../lib/create-session-manager.js";

export function registerDiscover(program: Command): void {
	program
		.command("discover [project]")
		.description("Discover new issues from tracker and spawn agent sessions")
		.option("--dry-run", "Show what would be spawned without spawning")
		.option("--label <label>", "Override the discovery label filter")
		.action(async (projectArg?: string, opts?: { dryRun?: boolean; label?: string }) => {
			try {
				const config = loadConfig();
				const registry = await getPluginRegistry(config);
				const sessionManager = await getSessionManager(config);

				const notifyHuman: IssueDiscoveryDeps["notifyHuman"] = async (
					event: OrchestratorEvent,
					priority: EventPriority,
				) => {
					const icon = priority === "urgent" ? "!" : priority === "warning" ? "?" : "-";
					console.log(`  ${icon} ${event.message}`);
				};

				const deps: IssueDiscoveryDeps = { config, registry, sessionManager, notifyHuman };

				// Determine which projects to scan
				const projectIds = projectArg
					? [projectArg]
					: Object.keys(config.projects);

				for (const projectId of projectIds) {
					const project = config.projects[projectId];
					if (!project) {
						console.error(chalk.red(`Project "${projectId}" not found`));
						continue;
					}

					// Apply CLI overrides
					const effectiveProject = { ...project };
					if (opts?.dryRun || opts?.label) {
						effectiveProject.autoDiscovery = {
							...project.autoDiscovery,
							enabled: true,
							...(opts.dryRun && { dryRun: true }),
							...(opts.label && { label: opts.label }),
						};
					} else if (!project.autoDiscovery?.enabled) {
						// For manual runs, force enabled even if config says disabled
						effectiveProject.autoDiscovery = {
							...project.autoDiscovery,
							enabled: true,
						};
					}

					console.log(chalk.bold(`\nDiscovering issues for ${chalk.cyan(projectId)}...`));

					const discoveryConfig = resolveAutoDiscoveryConfig(effectiveProject);
					console.log(chalk.dim(`  Label: ${discoveryConfig.label}`));
					console.log(chalk.dim(`  Max concurrent: ${discoveryConfig.maxConcurrent}`));
					console.log(chalk.dim(`  Dry run: ${discoveryConfig.dryRun}`));

					const result = await discoverAndSpawn(projectId, effectiveProject, deps);

					console.log(`\n  Discovered: ${result.discovered}`);
					console.log(`  Spawned:    ${chalk.green(String(result.spawned))}`);
					console.log(`  Skipped:    ${chalk.yellow(String(result.skipped))}`);

					for (const issue of result.issues) {
						const icon =
							issue.action === "spawned" ? "+" :
							issue.action === "skipped_active" ? "~" :
							issue.action === "skipped_max" ? "x" :
							issue.action === "skipped_dry_run" ? "?" :
							"!";
						console.log(`  ${icon} ${issue.identifier} -- ${issue.action}`);
						if (issue.error) {
							console.log(chalk.red(`     ${issue.error}`));
						}
					}
				}

				console.log(chalk.bold.green("\nDiscovery complete\n"));
			} catch (err) {
				console.error(chalk.red("\nError:"), err instanceof Error ? err.message : String(err));
				process.exit(1);
			}
		});
}
