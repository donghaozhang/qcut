/**
 * Session Manager — CRUD for agent sessions.
 *
 * High-level composition root. Heavy operations are split into dedicated
 * modules to keep responsibilities focused and testable.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
	Agent,
	OrchestratorConfig,
	PluginRegistry,
	ProjectConfig,
	Runtime,
	SCM,
	Session,
	SessionManager,
	SessionStatus,
	Tracker,
	Workspace,
} from "./types.js";
import { getSessionsDir } from "./paths.js";
import type {
	ResolvedPlugins,
	SessionManagerContext,
} from "./session-manager-internal-types.js";
import { listSessions, getSession } from "./session-manager-query.js";
import {
	cleanupSessions,
	killSession,
	restoreSession,
	sendToSession,
	sendOrRestartAgent,
} from "./session-manager-maintenance.js";
import {
	spawnOrchestratorSession,
	spawnSession,
} from "./session-manager-spawn.js";

export interface SessionManagerDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
}

/** Create a SessionManager instance. */
export function createSessionManager(deps: SessionManagerDeps): SessionManager {
	const { config, registry } = deps;

	function getProjectSessionsDir(project: ProjectConfig): string {
		return getSessionsDir(config.configPath, project.path);
	}

	function listAllSessions(
		projectIdFilter?: string
	): Array<{ sessionName: string; projectId: string }> {
		const results: Array<{ sessionName: string; projectId: string }> = [];

		for (const [projectKey, project] of Object.entries(config.projects)) {
			const projectId = projectKey;
			if (projectIdFilter && projectId !== projectIdFilter) {
				continue;
			}

			const sessionsDir = getSessionsDir(config.configPath, project.path);
			if (!existsSync(sessionsDir)) {
				continue;
			}

			const files = readdirSync(sessionsDir);
			for (const file of files) {
				if (file === "archive" || file.startsWith(".")) {
					continue;
				}
				const fullPath = join(sessionsDir, file);
				try {
					if (statSync(fullPath).isFile()) {
						results.push({ sessionName: file, projectId });
					}
				} catch {
					// Skip files that can't be stat'd
				}
			}
		}

		return results;
	}

	function resolvePlugins(
		project: ProjectConfig,
		agentOverride?: string
	): ResolvedPlugins {
		const runtime = registry.get<Runtime>(
			"runtime",
			project.runtime ?? config.defaults.runtime
		);
		const agent = registry.get<Agent>(
			"agent",
			agentOverride ?? project.agent ?? config.defaults.agent
		);
		const workspace = registry.get<Workspace>(
			"workspace",
			project.workspace ?? config.defaults.workspace
		);
		const tracker = project.tracker
			? registry.get<Tracker>("tracker", project.tracker.plugin)
			: null;
		const scm = project.scm
			? registry.get<SCM>("scm", project.scm.plugin)
			: null;

		return { runtime, agent, workspace, tracker, scm };
	}

	const TERMINAL_SESSION_STATUSES = new Set([
		"killed",
		"done",
		"merged",
		"terminated",
		"cleanup",
	]);

	async function enrichSessionWithRuntimeState(
		session: Session,
		plugins: ResolvedPlugins,
		handleFromMetadata: boolean
	): Promise<void> {
		if (TERMINAL_SESSION_STATUSES.has(session.status)) {
			session.activity = "exited";
			return;
		}

		if (handleFromMetadata && session.runtimeHandle && plugins.runtime) {
			try {
				const alive = await plugins.runtime.isAlive(session.runtimeHandle);
				if (!alive) {
					session.status = "killed";
					session.activity = "exited";
					return;
				}
			} catch {
				// Can't check liveness — continue to activity detection
			}
		}

		if (plugins.agent) {
			try {
				const detected = await plugins.agent.getActivityState(
					session,
					config.readyThresholdMs
				);
				if (detected !== null) {
					session.activity = detected.state;
					if (
						detected.timestamp &&
						detected.timestamp > session.lastActivityAt
					) {
						session.lastActivityAt = detected.timestamp;
					}
				}
			} catch {
				// Can't detect activity — keep existing value
			}

			try {
				const info = await plugins.agent.getSessionInfo(session);
				if (info) {
					session.agentInfo = info;
				}
			} catch {
				// Can't get session info — keep existing values
			}
		}
	}

	async function ensureHandleAndEnrich(
		session: Session,
		sessionName: string,
		project: ProjectConfig,
		plugins: ResolvedPlugins
	): Promise<void> {
		const handleFromMetadata = session.runtimeHandle !== null;
		if (!handleFromMetadata) {
			session.runtimeHandle = {
				id: sessionName,
				runtimeName: project.runtime ?? config.defaults.runtime,
				data: {},
			};
		}
		await enrichSessionWithRuntimeState(session, plugins, handleFromMetadata);
	}

	const context: SessionManagerContext = {
		config,
		registry,
		getProjectSessionsDir,
		listAllSessions,
		resolvePlugins,
		ensureHandleAndEnrich,
		enrichSessionWithRuntimeState,
	};

	return {
		spawn: async (spawnConfig) => spawnSession({ context, spawnConfig }),
		spawnOrchestrator: async (orchestratorConfig) =>
			spawnOrchestratorSession({ context, orchestratorConfig }),
		restore: async (sessionId) => restoreSession({ context, sessionId }),
		list: async (projectId?: string) => listSessions({ context, projectId }),
		get: async (sessionId) => getSession({ context, sessionId }),
		kill: async (sessionId) => killSession({ context, sessionId }),
		cleanup: async (projectId?: string, options?: { dryRun?: boolean }) =>
			cleanupSessions({ context, projectId, options }),
		send: async (sessionId, message) =>
			sendToSession({ context, sessionId, message }),
		sendOrRestart: async (sessionId, message) =>
			sendOrRestartAgent({ context, sessionId, message }),
	};
}
