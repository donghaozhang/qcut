import chalk from "chalk";
import ora from "ora";
import type { Command } from "commander";
import {
	evaluatePolicyGate,
	loadConfig,
	loadWorkflowContract,
	resolveEffectiveWorkflowPolicy,
	resolveWorkflowContractPath,
	type PolicyGateResult,
	type SCM,
	type Session,
} from "@composio/ao-core";
import {
	getPluginRegistry,
	getSessionManager,
} from "../lib/create-session-manager.js";

interface SessionPolicyReport {
	session: Session;
	projectName: string;
	prNumber: number;
	result: PolicyGateResult;
	contractPath?: string;
}

async function evaluateSessionPolicy({
	config,
	registry,
	session,
}: {
	config: ReturnType<typeof loadConfig>;
	registry: Awaited<ReturnType<typeof getPluginRegistry>>;
	session: Session;
}): Promise<SessionPolicyReport | null> {
	try {
		const project = config.projects[session.projectId];
		if (!project?.scm) {
			return null;
		}

		const scm = registry.get<SCM>("scm", project.scm.plugin);
		if (!scm || !session.pr) {
			return null;
		}

		const workflowContract = loadWorkflowContract({
			config,
			project,
		});
		const effectivePolicy = resolveEffectiveWorkflowPolicy({
			config,
			project,
			contract: workflowContract,
		});
		const result = await evaluatePolicyGate({
			scm,
			pr: session.pr,
			mode: effectivePolicy.mode,
			policy: effectivePolicy.policy,
		});

		return {
			session,
			projectName: project.name,
			prNumber: session.pr.number,
			result,
			contractPath: workflowContract?.path,
		};
	} catch {
		return null;
	}
}

function printViolations({ result }: { result: PolicyGateResult }): void {
	for (const violation of result.violations) {
		console.log(`    - ${chalk.red(violation.code)}: ${violation.message}`);
	}
}

async function resolveTargetSessions({
	target,
	config,
	sessionManager,
}: {
	target: string | undefined;
	config: ReturnType<typeof loadConfig>;
	sessionManager: Awaited<ReturnType<typeof getSessionManager>>;
}): Promise<Session[]> {
	if (!target) {
		return sessionManager.list();
	}

	if (config.projects[target]) {
		return sessionManager.list(target);
	}

	const session = await sessionManager.get(target);
	if (!session) {
		throw new Error(
			`Unknown target '${target}'. Use a project ID or a session ID.`
		);
	}
	return [session];
}

export function registerPolicy(program: Command): void {
	const policy = program
		.command("policy")
		.description("Inspect workflow policy gates");

	policy
		.command("check")
		.argument("[target]", "Session ID or project ID")
		.description("Evaluate policy gates for one session, one project, or all")
		.action(async (target: string | undefined) => {
			try {
				const config = loadConfig();
				const [sessionManager, registry] = await Promise.all([
					getSessionManager(config),
					getPluginRegistry(config),
				]);

				const sessions = await resolveTargetSessions({
					target,
					config,
					sessionManager,
				});
				const spinner = ora("Evaluating policy gates...").start();

				const reports: SessionPolicyReport[] = [];
				for (const session of sessions) {
					const report = await evaluateSessionPolicy({
						config,
						registry,
						session,
					});
					if (report) {
						reports.push(report);
					}
				}

				spinner.stop();

				if (reports.length === 0) {
					console.log(
						chalk.yellow(
							"No sessions with an attached PR + SCM plugin were found for policy evaluation."
						)
					);
					return;
				}

				let hasEnforcedFailures = false;
				for (const report of reports) {
					const stateLabel = report.result.passed
						? chalk.green("PASS")
						: chalk.red("FAIL");
					console.log(
						`${stateLabel} ${chalk.bold(report.session.id)} (${report.projectName}) PR #${String(report.prNumber)} mode=${report.result.mode}`
					);
					if (report.contractPath) {
						console.log(`    contract: ${chalk.dim(report.contractPath)}`);
					}
					if (!report.result.passed) {
						printViolations({ result: report.result });
						if (report.result.mode === "enforced") {
							hasEnforcedFailures = true;
						}
					}
				}

				if (hasEnforcedFailures) {
					process.exitCode = 2;
				}
			} catch (error) {
				console.error(
					chalk.red(
						`policy check failed: ${error instanceof Error ? error.message : String(error)}`
					)
				);
				process.exit(1);
			}
		});

	policy
		.command("explain")
		.argument("<session>", "Session ID")
		.description("Explain why a session passes or fails workflow policy gates")
		.action(async (sessionId: string) => {
			try {
				const config = loadConfig();
				const [sessionManager, registry] = await Promise.all([
					getSessionManager(config),
					getPluginRegistry(config),
				]);

				const session = await sessionManager.get(sessionId);
				if (!session) {
					throw new Error(`Session '${sessionId}' not found`);
				}

				const report = await evaluateSessionPolicy({
					config,
					registry,
					session,
				});
				if (!report) {
					throw new Error(
						"Session is missing PR/SCM context required for policy explanation"
					);
				}

				const status = report.result.passed
					? chalk.green("PASS")
					: chalk.red("FAIL");
				console.log(
					`${status} ${chalk.bold(report.session.id)} PR #${String(report.prNumber)} mode=${report.result.mode}`
				);
				if (report.contractPath) {
					console.log(`contract: ${chalk.dim(report.contractPath)}`);
				}

				if (report.result.passed) {
					console.log(
						chalk.green(
							"Policy gate passed. Review/CI/mergeability requirements are satisfied."
						)
					);
					return;
				}

				console.log("Violations:");
				printViolations({ result: report.result });

				if (report.result.mode === "enforced") {
					process.exitCode = 2;
				}
			} catch (error) {
				console.error(
					chalk.red(
						`policy explain failed: ${error instanceof Error ? error.message : String(error)}`
					)
				);
				process.exit(1);
			}
		});

	const workflow = program
		.command("workflow")
		.description("Workflow contract tools");

	workflow
		.command("lint")
		.argument("[project]", "Project ID (lints all if omitted)")
		.description("Parse and validate workflow contract files")
		.action(async (projectId: string | undefined) => {
			try {
				const config = loadConfig();
				if (projectId && !config.projects[projectId]) {
					throw new Error(`Unknown project '${projectId}'`);
				}

				const projectIds = projectId
					? [projectId]
					: Object.keys(config.projects);

				let hasErrors = false;
				for (const id of projectIds) {
					const project = config.projects[id];
					if (!project) {
						continue;
					}

					const contractPathResult = resolveWorkflowContractPath({
						config,
						project,
					});
					if (!contractPathResult.path) {
						console.log(
							`${chalk.yellow("WARN")} ${id}: no workflow contract found (checked ${contractPathResult.candidates.join(", ")})`
						);
						continue;
					}

					try {
						const workflowContract = loadWorkflowContract({
							config,
							project,
						});
						const effective = resolveEffectiveWorkflowPolicy({
							config,
							project,
							contract: workflowContract,
						});
						console.log(
							`${chalk.green("OK")} ${id}: ${contractPathResult.path} mode=${effective.mode}`
						);
						console.log(
							`    reviewGate(enabled=${String(effective.policy.reviewGate.enabled)}, requireSweep=${String(effective.policy.reviewGate.requireReviewSweep)}, maxUnresolved=${String(effective.policy.reviewGate.maxUnresolvedComments)})`
						);
						console.log(
							`    mergeGate(enabled=${String(effective.policy.mergeGate.enabled)}, requireCi=${String(effective.policy.mergeGate.requireCiPassing)}, requiredChecks=${effective.policy.mergeGate.requiredChecks.join(", ") || "none"})`
						);
					} catch (error) {
						hasErrors = true;
						console.log(
							`${chalk.red("ERROR")} ${id}: ${error instanceof Error ? error.message : String(error)}`
						);
					}
				}

				if (hasErrors) {
					process.exitCode = 1;
				}
			} catch (error) {
				console.error(
					chalk.red(
						`workflow lint failed: ${error instanceof Error ? error.message : String(error)}`
					)
				);
				process.exit(1);
			}
		});
}
