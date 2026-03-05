import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	isIssueNotFoundError,
	type Agent,
	type OrchestratorSpawnConfig,
	type RuntimeHandle,
	type Session,
	type SessionSpawnConfig,
	type Issue,
} from "./types.js";
import {
	deleteMetadata,
	listMetadata,
	reserveSessionId,
	writeMetadata,
} from "./metadata.js";
import { buildPrompt } from "./prompt-builder.js";
import {
	loadWorkflowContract,
	resolveEffectiveWorkflowPolicy,
} from "./workflow-contract.js";
import {
	generateConfigHash,
	generateTmuxName,
	getProjectBaseDir,
	validateAndStoreOrigin,
} from "./paths.js";
import type { SessionManagerContext } from "./session-manager-internal-types.js";
import { getNextSessionNumber } from "./session-manager-utils.js";

export async function spawnSession({
	context,
	spawnConfig,
}: {
	context: SessionManagerContext;
	spawnConfig: SessionSpawnConfig;
}): Promise<Session> {
	const { config, registry } = context;
	const project = config.projects[spawnConfig.projectId];
	if (!project) {
		throw new Error(`Unknown project: ${spawnConfig.projectId}`);
	}

	const plugins = context.resolvePlugins(project);
	if (!plugins.runtime) {
		throw new Error(
			`Runtime plugin '${project.runtime ?? config.defaults.runtime}' not found`
		);
	}

	if (spawnConfig.agent) {
		const overrideAgent = registry.get<Agent>("agent", spawnConfig.agent);
		if (!overrideAgent) {
			throw new Error(`Agent plugin '${spawnConfig.agent}' not found`);
		}
		plugins.agent = overrideAgent;
	}

	if (!plugins.agent) {
		throw new Error(
			`Agent plugin '${project.agent ?? config.defaults.agent}' not found`
		);
	}

	let resolvedIssue: Issue | undefined;
	if (spawnConfig.issueId && plugins.tracker) {
		try {
			resolvedIssue = await plugins.tracker.getIssue(spawnConfig.issueId, project);
		} catch (err) {
			if (!isIssueNotFoundError(err)) {
				throw new Error(`Failed to fetch issue ${spawnConfig.issueId}: ${err}`, {
					cause: err,
				});
			}
		}
	}

	const sessionsDir = context.getProjectSessionsDir(project);
	if (config.configPath) {
		validateAndStoreOrigin(config.configPath, project.path);
	}

	const existingSessions = listMetadata(sessionsDir);
	let issueSlug = "";
	if (resolvedIssue) {
		issueSlug = resolvedIssue.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 30)
			.replace(/-$/, "");
	}

	let num = getNextSessionNumber(existingSessions, project.sessionPrefix);
	let sessionId = `${project.sessionPrefix}-${num}`;
	let tmuxName: string | undefined;
	for (let attempts = 0; attempts < 10; attempts++) {
		sessionId = issueSlug
			? `${project.sessionPrefix}-${issueSlug}`
			: `${project.sessionPrefix}-${num}`;
		if (config.configPath) {
			tmuxName = generateTmuxName(config.configPath, project.sessionPrefix, num);
		}
		if (reserveSessionId(sessionsDir, sessionId)) {
			break;
		}
		if (issueSlug) {
			sessionId = `${project.sessionPrefix}-${issueSlug}-${num}`;
			if (reserveSessionId(sessionsDir, sessionId)) {
				break;
			}
		}
		num++;
		if (attempts === 9) {
			throw new Error(
				`Failed to reserve session ID after 10 attempts (prefix: ${project.sessionPrefix})`
			);
		}
	}

	let branch: string;
	if (spawnConfig.branch) {
		branch = spawnConfig.branch;
	} else if (spawnConfig.issueId && plugins.tracker) {
		branch = await plugins.tracker.branchName(spawnConfig.issueId, project);
	} else if (spawnConfig.issueId) {
		branch = `feat/${spawnConfig.issueId}`;
	} else {
		branch = `session/${sessionId}`;
	}

	let workspacePath = project.path;
	if (plugins.workspace) {
		try {
			const wsInfo = await plugins.workspace.create({
				projectId: spawnConfig.projectId,
				project,
				sessionId,
				branch,
			});
			workspacePath = wsInfo.path;

			if (plugins.workspace.postCreate) {
				try {
					await plugins.workspace.postCreate(wsInfo, project);
				} catch (err) {
					if (workspacePath !== project.path) {
						try {
							await plugins.workspace.destroy(workspacePath);
						} catch {
							/* best effort */
						}
					}
					throw err;
				}
			}
		} catch (err) {
			try {
				deleteMetadata(sessionsDir, sessionId, false);
			} catch {
				/* best effort */
			}
			throw err;
		}
	}

	let issueContext: string | undefined;
	if (spawnConfig.issueId && plugins.tracker && resolvedIssue) {
		try {
			issueContext = await plugins.tracker.generatePrompt(
				spawnConfig.issueId,
				project
			);
		} catch {
			// Non-fatal: continue without detailed issue context
		}
	}

	let workflowContractPrompt: string | null = null;
	let workflowContractPath: string | undefined;
	try {
		const workflowContract = loadWorkflowContract({
			config,
			project,
		});
		const effectivePolicy = resolveEffectiveWorkflowPolicy({
			config,
			project,
			contract: workflowContract,
		});
		workflowContractPrompt = effectivePolicy.promptTemplate;
		workflowContractPath = workflowContract?.path;
	} catch {
		workflowContractPrompt = null;
		workflowContractPath = undefined;
	}

	const composedPrompt = buildPrompt({
		project,
		projectId: spawnConfig.projectId,
		issueId: spawnConfig.issueId,
		issueContext,
		userPrompt: spawnConfig.prompt,
		workflowContractPrompt,
		workflowContractPath,
	});

	const agentLaunchConfig = {
		sessionId,
		projectConfig: project,
		issueId: spawnConfig.issueId,
		prompt: composedPrompt ?? spawnConfig.prompt,
		permissions: project.agentConfig?.permissions,
		model: project.agentConfig?.model,
	};

	let handle: RuntimeHandle;
	try {
		const launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
		const environment = plugins.agent.getEnvironment(agentLaunchConfig);

		handle = await plugins.runtime.create({
			sessionId: tmuxName ?? sessionId,
			workspacePath,
			launchCommand,
			environment: {
				...environment,
				QAGENT_SESSION: sessionId,
				QAGENT_DATA_DIR: sessionsDir,
				QAGENT_SESSION_NAME: sessionId,
				...(tmuxName && { QAGENT_TMUX_NAME: tmuxName }),
			},
		});
	} catch (err) {
		if (plugins.workspace && workspacePath !== project.path) {
			try {
				await plugins.workspace.destroy(workspacePath);
			} catch {
				/* best effort */
			}
		}
		try {
			deleteMetadata(sessionsDir, sessionId, false);
		} catch {
			/* best effort */
		}
		throw err;
	}

	const session: Session = {
		id: sessionId,
		projectId: spawnConfig.projectId,
		status: "spawning",
		activity: "active",
		branch,
		issueId: spawnConfig.issueId ?? null,
		pr: null,
		workspacePath,
		runtimeHandle: handle,
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
	};

	try {
		writeMetadata(sessionsDir, sessionId, {
			worktree: workspacePath,
			branch,
			status: "spawning",
			tmuxName,
			issue: spawnConfig.issueId,
			project: spawnConfig.projectId,
			agent: plugins.agent.name,
			createdAt: new Date().toISOString(),
			runtimeHandle: JSON.stringify(handle),
		});

		if (plugins.agent.postLaunchSetup) {
			await plugins.agent.postLaunchSetup(session);
		}
	} catch (err) {
		try {
			await plugins.runtime.destroy(handle);
		} catch {
			/* best effort */
		}
		if (plugins.workspace && workspacePath !== project.path) {
			try {
				await plugins.workspace.destroy(workspacePath);
			} catch {
				/* best effort */
			}
		}
		try {
			deleteMetadata(sessionsDir, sessionId, false);
		} catch {
			/* best effort */
		}
		throw err;
	}

	return session;
}

export async function spawnOrchestratorSession({
	context,
	orchestratorConfig,
}: {
	context: SessionManagerContext;
	orchestratorConfig: OrchestratorSpawnConfig;
}): Promise<Session> {
	const { config } = context;
	const project = config.projects[orchestratorConfig.projectId];
	if (!project) {
		throw new Error(`Unknown project: ${orchestratorConfig.projectId}`);
	}

	const plugins = context.resolvePlugins(project);
	if (!plugins.runtime) {
		throw new Error(
			`Runtime plugin '${project.runtime ?? config.defaults.runtime}' not found`
		);
	}
	if (!plugins.agent) {
		throw new Error(
			`Agent plugin '${project.agent ?? config.defaults.agent}' not found`
		);
	}

	const sessionId = `${project.sessionPrefix}-orchestrator`;
	let tmuxName: string | undefined;
	if (config.configPath) {
		const hash = generateConfigHash(config.configPath);
		tmuxName = `${hash}-${sessionId}`;
	}

	const sessionsDir = context.getProjectSessionsDir(project);
	if (config.configPath) {
		validateAndStoreOrigin(config.configPath, project.path);
	}

	const existingMeta = listMetadata(sessionsDir);
	if (existingMeta.includes(sessionId)) {
		throw new Error(
			`Orchestrator session '${sessionId}' already exists. Kill the existing session before re-spawning.`
		);
	}
	reserveSessionId(sessionsDir, sessionId);

	if (plugins.agent.setupWorkspaceHooks) {
		await plugins.agent.setupWorkspaceHooks(project.path, {
			dataDir: sessionsDir,
		});
	}

	let systemPromptFile: string | undefined;
	if (orchestratorConfig.systemPrompt) {
		const baseDir = getProjectBaseDir(config.configPath, project.path);
		mkdirSync(baseDir, { recursive: true });
		systemPromptFile = join(baseDir, "orchestrator-prompt.md");
		writeFileSync(systemPromptFile, orchestratorConfig.systemPrompt, "utf-8");
	}

	const agentLaunchConfig = {
		sessionId,
		projectConfig: project,
		permissions: project.agentConfig?.permissions,
		model: project.agentConfig?.model,
		systemPromptFile,
	};

	const launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
	const environment = plugins.agent.getEnvironment(agentLaunchConfig);

	const handle = await plugins.runtime.create({
		sessionId: tmuxName ?? sessionId,
		workspacePath: project.path,
		launchCommand,
		environment: {
			...environment,
			AO_SESSION: sessionId,
			AO_DATA_DIR: sessionsDir,
			AO_SESSION_NAME: sessionId,
			...(tmuxName && { AO_TMUX_NAME: tmuxName }),
		},
	});

	const session: Session = {
		id: sessionId,
		projectId: orchestratorConfig.projectId,
		status: "working",
		activity: "active",
		branch: project.defaultBranch,
		issueId: null,
		pr: null,
		workspacePath: project.path,
		runtimeHandle: handle,
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
	};

	try {
		writeMetadata(sessionsDir, sessionId, {
			worktree: project.path,
			branch: project.defaultBranch,
			status: "working",
			tmuxName,
			project: orchestratorConfig.projectId,
			createdAt: new Date().toISOString(),
			runtimeHandle: JSON.stringify(handle),
		});

		if (plugins.agent.postLaunchSetup) {
			await plugins.agent.postLaunchSetup(session);
		}
	} catch (err) {
		try {
			await plugins.runtime.destroy(handle);
		} catch {
			/* best effort */
		}
		try {
			deleteMetadata(sessionsDir, sessionId, false);
		} catch {
			/* best effort */
		}
		throw err;
	}

	return session;
}
