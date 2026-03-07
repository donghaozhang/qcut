import { existsSync } from "node:fs";
import {
	deleteMetadata,
	readArchivedMetadataRaw,
	readMetadataRaw,
	updateMetadata,
	writeMetadata,
} from "./metadata.js";
import {
	isRestorable,
	NON_RESTORABLE_STATUSES,
	PR_STATE,
	SessionNotRestorableError,
	type Agent,
	type CleanupResult,
	type ProjectConfig,
	type Runtime,
	type RuntimeHandle,
	type Session,
	type SessionId,
	WorkspaceMissingError,
} from "./types.js";
import type { SessionManagerContext } from "./session-manager-internal-types.js";
import { metadataToSession, safeJsonParse } from "./session-manager-utils.js";
import { listSessions } from "./session-manager-query.js";

interface SessionLocation {
	project: ProjectConfig;
	sessionsDir: string;
	raw: Record<string, string>;
	projectId: string;
}

interface SessionLocationWithArchive extends SessionLocation {
	fromArchive: boolean;
}

function findActiveSessionLocation({
	context,
	sessionId,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
}): SessionLocation | null {
	for (const [projectId, project] of Object.entries(context.config.projects)) {
		const sessionsDir = context.getProjectSessionsDir(project);
		const raw = readMetadataRaw(sessionsDir, sessionId);
		if (!raw) {
			continue;
		}
		return {
			project,
			sessionsDir,
			raw,
			projectId,
		};
	}
	return null;
}

function findSessionLocationIncludingArchive({
	context,
	sessionId,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
}): SessionLocationWithArchive | null {
	const active = findActiveSessionLocation({ context, sessionId });
	if (active) {
		return {
			...active,
			fromArchive: false,
		};
	}

	for (const [projectId, project] of Object.entries(context.config.projects)) {
		const sessionsDir = context.getProjectSessionsDir(project);
		const raw = readArchivedMetadataRaw(sessionsDir, sessionId);
		if (!raw) {
			continue;
		}
		return {
			project,
			sessionsDir,
			raw,
			projectId,
			fromArchive: true,
		};
	}

	return null;
}

export async function killSession({
	context,
	sessionId,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
}): Promise<void> {
	const located = findActiveSessionLocation({ context, sessionId });
	if (!located) {
		throw new Error(`Session ${sessionId} not found`);
	}

	const { raw, project, sessionsDir } = located;

	if (raw.runtimeHandle) {
		const handle = safeJsonParse<RuntimeHandle>(raw.runtimeHandle);
		if (handle) {
			const runtimePlugin = context.registry.get<Runtime>(
				"runtime",
				handle.runtimeName ?? (project.runtime ?? context.config.defaults.runtime)
			);
			if (runtimePlugin) {
				try {
					await runtimePlugin.destroy(handle);
				} catch {
					// Runtime might already be gone
				}
			}
		}
	}

	const worktree = raw.worktree;
	const isProjectPath = worktree === project.path;
	if (worktree && !isProjectPath) {
		const workspacePlugin = context.resolvePlugins(project).workspace;
		if (workspacePlugin) {
			try {
				await workspacePlugin.destroy(worktree);
			} catch {
				// Workspace might already be gone
			}
		}
	}

	deleteMetadata(sessionsDir, sessionId, true);
}

export async function cleanupSessions({
	context,
	projectId,
	options,
}: {
	context: SessionManagerContext;
	projectId?: string;
	options?: { dryRun?: boolean };
}): Promise<CleanupResult> {
	const result: CleanupResult = { killed: [], skipped: [], errors: [] };
	const sessions = await listSessions({ context, projectId });

	for (const session of sessions) {
		try {
			const project = context.config.projects[session.projectId];
			if (!project) {
				result.skipped.push(session.id);
				continue;
			}

			const plugins = context.resolvePlugins(project);
			let shouldKill = false;

			if (session.pr && plugins.scm) {
				try {
					const prState = await plugins.scm.getPRState(session.pr);
					if (prState === PR_STATE.MERGED || prState === PR_STATE.CLOSED) {
						shouldKill = true;
					}
				} catch {
					// Can't check PR — skip
				}
			}

			if (!shouldKill && session.issueId && plugins.tracker) {
				try {
					const completed = await plugins.tracker.isCompleted(
						session.issueId,
						project
					);
					if (completed) {
						shouldKill = true;
					}
				} catch {
					// Can't check issue — skip
				}
			}

			if (!shouldKill && session.runtimeHandle && plugins.runtime) {
				try {
					const alive = await plugins.runtime.isAlive(session.runtimeHandle);
					if (!alive) {
						shouldKill = true;
					}
				} catch {
					// Can't check runtime — skip
				}
			}

			if (shouldKill) {
				if (!options?.dryRun) {
					await killSession({ context, sessionId: session.id });
				}
				result.killed.push(session.id);
			} else {
				result.skipped.push(session.id);
			}
		} catch (err) {
			result.errors.push({
				sessionId: session.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return result;
}

export async function sendToSession({
	context,
	sessionId,
	message,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
	message: string;
}): Promise<void> {
	let raw: Record<string, string> | null = null;
	for (const project of Object.values(context.config.projects)) {
		const sessionsDir = context.getProjectSessionsDir(project);
		const metadata = readMetadataRaw(sessionsDir, sessionId);
		if (metadata) {
			raw = metadata;
			break;
		}
	}

	if (!raw) {
		throw new Error(`Session ${sessionId} not found`);
	}

	let handle: RuntimeHandle;
	if (raw.runtimeHandle) {
		const parsed = safeJsonParse<RuntimeHandle>(raw.runtimeHandle);
		if (!parsed) {
			throw new Error(`Corrupted runtime handle for session ${sessionId}`);
		}
		handle = parsed;
	} else {
		handle = {
			id: sessionId,
			runtimeName: context.config.defaults.runtime,
			data: {},
		};
	}

	const project = context.config.projects[raw.project ?? ""];
	const runtimePlugin = context.registry.get<Runtime>(
		"runtime",
		handle.runtimeName ??
			(project
				? (project.runtime ?? context.config.defaults.runtime)
				: context.config.defaults.runtime)
	);
	if (!runtimePlugin) {
		throw new Error(`No runtime plugin for session ${sessionId}`);
	}

	await runtimePlugin.sendMessage(handle, message);
}

/**
 * Send a message to a session's agent, re-launching the agent if it has exited.
 * This is critical for reactions like `send-to-agent` — if CI fails after the
 * agent created a PR and exited, we need to re-launch it to fix the failure.
 */
export async function sendOrRestartAgent({
	context,
	sessionId,
	message,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
	message: string;
}): Promise<{ restarted: boolean }> {
	const located = findActiveSessionLocation({ context, sessionId });
	if (!located) {
		throw new Error(`Session ${sessionId} not found`);
	}

	const { raw, project, sessionsDir, projectId } = located;
	const plugins = context.resolvePlugins(project, raw.agent);

	if (!plugins.runtime || !plugins.agent) {
		// Fall back to basic send
		await sendToSession({ context, sessionId, message });
		return { restarted: false };
	}

	// Check if the agent process is still alive
	let agentAlive = false;
	if (raw.runtimeHandle) {
		const handle = safeJsonParse<RuntimeHandle>(raw.runtimeHandle);
		if (handle) {
			try {
				agentAlive = await plugins.agent.isProcessRunning(handle);
			} catch {
				// Can't determine — assume dead
			}
		}
	}

	if (agentAlive) {
		// Agent is alive — just send the message
		await sendToSession({ context, sessionId, message });
		return { restarted: false };
	}

	// Agent is dead — re-launch it in the existing tmux session with a focused prompt
	const handle = raw.runtimeHandle
		? safeJsonParse<RuntimeHandle>(raw.runtimeHandle)
		: null;

	if (!handle) {
		throw new Error(`No runtime handle for session ${sessionId}`);
	}

	const workspacePath = raw.worktree || project.path;
	const launchCommand = plugins.agent.getLaunchCommand({
		sessionId,
		projectConfig: project,
		issueId: raw.issue ?? undefined,
		prompt: message,
		permissions: project.agentConfig?.permissions as "skip" | "default" | undefined,
		model: project.agentConfig?.model,
	});

	// Send the launch command into the tmux session to start a new Claude Code process
	await plugins.runtime.sendMessage(handle, launchCommand);

	updateMetadata(sessionsDir, sessionId, {
		status: "spawning",
		restartedAt: new Date().toISOString(),
	});

	return { restarted: true };
}

export async function restoreSession({
	context,
	sessionId,
}: {
	context: SessionManagerContext;
	sessionId: SessionId;
}): Promise<Session> {
	const located = findSessionLocationIncludingArchive({ context, sessionId });
	if (!located) {
		throw new Error(`Session ${sessionId} not found`);
	}

	const { raw, sessionsDir, project, projectId, fromArchive } = located;

	if (fromArchive) {
		writeMetadata(sessionsDir, sessionId, {
			worktree: raw.worktree ?? "",
			branch: raw.branch ?? "",
			status: raw.status ?? "killed",
			tmuxName: raw.tmuxName,
			issue: raw.issue,
			pr: raw.pr,
			summary: raw.summary,
			project: raw.project,
			createdAt: raw.createdAt,
			runtimeHandle: raw.runtimeHandle,
		});
	}

	const session = metadataToSession(sessionId, raw);
	const plugins = context.resolvePlugins(project, raw.agent);
	await context.enrichSessionWithRuntimeState(session, plugins, true);

	if (!isRestorable(session)) {
		if (NON_RESTORABLE_STATUSES.has(session.status)) {
			throw new SessionNotRestorableError(
				sessionId,
				`status is "${session.status}"`
			);
		}
		throw new SessionNotRestorableError(
			sessionId,
			"session is not in a terminal state"
		);
	}

	if (!plugins.runtime) {
		throw new Error(
			`Runtime plugin '${project.runtime ?? context.config.defaults.runtime}' not found`
		);
	}
	if (!plugins.agent) {
		throw new Error(
			`Agent plugin '${project.agent ?? context.config.defaults.agent}' not found`
		);
	}

	const workspacePath = raw.worktree || project.path;
	const workspaceExists = plugins.workspace?.exists
		? await plugins.workspace.exists(workspacePath)
		: existsSync(workspacePath);

	if (!workspaceExists) {
		if (!plugins.workspace?.restore) {
			throw new WorkspaceMissingError(
				workspacePath,
				"workspace plugin does not support restore"
			);
		}
		if (!session.branch) {
			throw new WorkspaceMissingError(workspacePath, "branch metadata is missing");
		}
		try {
			const wsInfo = await plugins.workspace.restore(
				{
					projectId,
					project,
					sessionId,
					branch: session.branch,
				},
				workspacePath
			);
			if (plugins.workspace.postCreate) {
				await plugins.workspace.postCreate(wsInfo, project);
			}
		} catch (err) {
			throw new WorkspaceMissingError(
				workspacePath,
				`restore failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	if (session.runtimeHandle) {
		try {
			await plugins.runtime.destroy(session.runtimeHandle);
		} catch {
			// Best effort — may already be gone
		}
	}

	let launchCommand: string;
	const agentLaunchConfig = {
		sessionId,
		projectConfig: project,
		issueId: session.issueId ?? undefined,
		permissions: project.agentConfig?.permissions,
		model: project.agentConfig?.model,
	};

	if (plugins.agent.getRestoreCommand) {
		const restoreCmd = await plugins.agent.getRestoreCommand(session, project);
		launchCommand =
			restoreCmd ?? plugins.agent.getLaunchCommand(agentLaunchConfig);
	} else {
		launchCommand = plugins.agent.getLaunchCommand(agentLaunchConfig);
	}

	const environment = plugins.agent.getEnvironment(agentLaunchConfig);
	const tmuxName = raw.tmuxName;
	const handle = await plugins.runtime.create({
		sessionId: tmuxName ?? sessionId,
		workspacePath,
		launchCommand,
		environment: {
			...environment,
			AO_SESSION: sessionId,
			AO_DATA_DIR: sessionsDir,
			AO_SESSION_NAME: sessionId,
			...(tmuxName && { AO_TMUX_NAME: tmuxName }),
		},
	});

	const now = new Date().toISOString();
	updateMetadata(sessionsDir, sessionId, {
		status: "spawning",
		runtimeHandle: JSON.stringify(handle),
		restoredAt: now,
	});

	const restoredSession: Session = {
		...session,
		status: "spawning",
		activity: "active",
		workspacePath,
		runtimeHandle: handle,
		restoredAt: new Date(now),
	};

	if (plugins.agent.postLaunchSetup) {
		try {
			await plugins.agent.postLaunchSetup(restoredSession);
		} catch {
			// Non-fatal — session is already running
		}
	}

	return restoredSession;
}
