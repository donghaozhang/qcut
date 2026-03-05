import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import {
	collectPRFeedbackSweep,
	loadConfig,
	type PRInfo,
	type ProjectConfig,
	type SCM,
	type Session,
} from "@composio/ao-core";
import { exec } from "../lib/shell.js";
import {
	getPluginRegistry,
	getSessionManager,
} from "../lib/create-session-manager.js";

interface ReviewInfo {
	sessionId: string;
	tmuxTarget: string;
	prNumber: number;
	pendingComments: number;
	reviewDecision: string;
	actionableCount: number;
}

async function resolveSessionPR({
	scm,
	session,
	project,
}: {
	scm: Pick<SCM, "detectPR">;
	session: Session;
	project: ProjectConfig;
}): Promise<PRInfo | null> {
	try {
		if (session.pr && session.pr.number > 0) {
			return session.pr;
		}
		if (!session.branch) {
			return null;
		}
		return await scm.detectPR(session, project);
	} catch {
		return null;
	}
}

export function registerReviewCheck(program: Command): void {
	program
		.command("review-check")
		.description(
			"Check PRs for review comments and trigger agents to address them"
		)
		.argument("[project]", "Project ID (checks all if omitted)")
		.option("--dry-run", "Show what would be done without sending messages")
		.action(
			async (projectId: string | undefined, opts: { dryRun?: boolean }) => {
				try {
					const config = loadConfig();

					if (projectId && !config.projects[projectId]) {
						console.error(chalk.red(`Unknown project: ${projectId}`));
						process.exit(1);
					}

					const [sm, registry] = await Promise.all([
						getSessionManager(config),
						getPluginRegistry(config),
					]);
					const sessions = await sm.list(projectId);

					const spinner = ora("Checking PRs for review comments...").start();
					const results: ReviewInfo[] = [];

					for (const session of sessions) {
						const project = config.projects[session.projectId];
						if (!project?.scm) {
							continue;
						}

						const scm = registry.get<SCM>("scm", project.scm.plugin);
						if (!scm) {
							continue;
						}

						const pr = await resolveSessionPR({
							scm,
							session,
							project,
						});
						if (!pr) {
							continue;
						}

						try {
							const sweep = await collectPRFeedbackSweep({ scm, pr });
							if (!sweep.hasBlockingFeedback) {
								continue;
							}

							results.push({
								sessionId: session.id,
								tmuxTarget: session.runtimeHandle?.id ?? session.id,
								prNumber: pr.number,
								pendingComments: sweep.actionableHumanComments.length,
								reviewDecision: sweep.reviewDecision,
								actionableCount: sweep.actionableCount,
							});
						} catch {
							// Skip PRs we can't access this cycle
						}
					}

					spinner.stop();

					if (results.length === 0) {
						console.log(chalk.green("No pending review comments found."));
						return;
					}

					console.log(
						chalk.bold(
							`\nFound ${results.length} session${results.length > 1 ? "s" : ""} with pending reviews:\n`
						)
					);

					for (const result of results) {
						console.log(
							`  ${chalk.green(result.sessionId)}  PR #${String(result.prNumber)}`
						);
						console.log(
							`    Actionable items: ${chalk.yellow(String(result.actionableCount))}`
						);
						if (result.reviewDecision) {
							console.log(
								`    Decision: ${chalk.yellow(result.reviewDecision.toUpperCase())}`
							);
						}
						if (result.pendingComments > 0) {
							console.log(
								`    Human comments: ${chalk.yellow(String(result.pendingComments))}`
							);
						}

						if (opts.dryRun) {
							console.log(chalk.dim("    (dry run — would send fix prompt)"));
							continue;
						}

						try {
							await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "C-c"]);
							await new Promise((resolve) => setTimeout(resolve, 500));
							await exec("tmux", ["send-keys", "-t", result.tmuxTarget, "C-u"]);
							await new Promise((resolve) => setTimeout(resolve, 200));
							const message =
								"There are review comments on your PR. Run a full PR feedback sweep (top-level, inline, and bot comments), address each actionable item or post explicit pushback, rerun validation, then push updates.";
							await exec("tmux", [
								"send-keys",
								"-t",
								result.tmuxTarget,
								"-l",
								message,
							]);
							await new Promise((resolve) => setTimeout(resolve, 200));
							await exec("tmux", [
								"send-keys",
								"-t",
								result.tmuxTarget,
								"Enter",
							]);
							console.log(chalk.green("    -> Fix prompt sent"));
						} catch (error) {
							console.error(chalk.red(`    -> Failed to send: ${error}`));
						}
					}
					console.log();
				} catch (error) {
					console.error(
						chalk.red(
							`review-check failed: ${error instanceof Error ? error.message : String(error)}`
						)
					);
					process.exit(1);
				}
			}
		);
}
