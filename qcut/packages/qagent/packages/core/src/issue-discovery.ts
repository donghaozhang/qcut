/**
 * Issue Discovery Loop — polls tracker for new issues and auto-spawns agent sessions.
 *
 * Disabled by default. Enable per-project with `autoDiscovery` config:
 *
 * ```yaml
 * projects:
 *   qcut:
 *     autoDiscovery:
 *       enabled: false        # default: false
 *       label: "agent-ready"  # only pick up issues with this label
 *       maxConcurrent: 5      # max simultaneous auto-spawned sessions
 *       intervalMs: 60000     # poll interval (default: 60s)
 *       dryRun: false         # log what would spawn without actually spawning
 * ```
 *
 * Flow:
 *   1. Poll tracker for issues matching the configured label/filter
 *   2. Filter out issues that already have active sessions
 *   3. Respect maxConcurrent limit
 *   4. Spawn new sessions for remaining issues
 *   5. Notify human of auto-spawned sessions
 */

import type {
	OrchestratorConfig,
	ProjectConfig,
	OrchestratorEvent,
	EventPriority,
	PluginRegistry,
	Tracker,
	SessionManager,
} from "./types.js";
import { createEvent } from "./lifecycle-events.js";

// =============================================================================
// Types
// =============================================================================

export interface AutoDiscoveryConfig {
	/** Whether auto-discovery is enabled. Default: false */
	enabled: boolean;
	/** Only discover issues with this label. Required when enabled. */
	label?: string;
	/** Maximum concurrent auto-spawned sessions. Default: 5 */
	maxConcurrent?: number;
	/** How often to poll for new issues (ms). Default: 60000 */
	intervalMs?: number;
	/** Log what would be spawned without actually spawning. Default: false */
	dryRun?: boolean;
	/** Issue states to consider for auto-discovery. Default: ["Todo", "Backlog"] */
	states?: string[];
}

export interface DiscoveredIssue {
	id: string;
	identifier: string;
	title: string;
	labels: string[];
	state: string;
	url?: string;
}

export interface IssueDiscoveryResult {
	discovered: number;
	spawned: number;
	skipped: number;
	issues: Array<{
		id: string;
		identifier: string;
		action: "spawned" | "skipped_active" | "skipped_max" | "skipped_dry_run" | "failed";
		error?: string;
	}>;
}

export interface IssueDiscoveryDeps {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
	notifyHuman: (event: OrchestratorEvent, priority: EventPriority) => Promise<void>;
}

// =============================================================================
// Default config
// =============================================================================

const DEFAULT_AUTO_DISCOVERY: Required<AutoDiscoveryConfig> = {
	enabled: false,
	label: "agent-ready",
	maxConcurrent: 5,
	intervalMs: 60_000,
	dryRun: false,
	states: ["Todo"],
};

export function resolveAutoDiscoveryConfig(
	project: ProjectConfig
): Required<AutoDiscoveryConfig> {
	const raw = (project as ProjectConfig & { autoDiscovery?: Partial<AutoDiscoveryConfig> }).autoDiscovery;
	if (!raw) {
		return { ...DEFAULT_AUTO_DISCOVERY };
	}
	return {
		enabled: raw.enabled ?? DEFAULT_AUTO_DISCOVERY.enabled,
		label: raw.label ?? DEFAULT_AUTO_DISCOVERY.label,
		maxConcurrent: raw.maxConcurrent ?? DEFAULT_AUTO_DISCOVERY.maxConcurrent,
		intervalMs: raw.intervalMs ?? DEFAULT_AUTO_DISCOVERY.intervalMs,
		dryRun: raw.dryRun ?? DEFAULT_AUTO_DISCOVERY.dryRun,
		states: raw.states ?? DEFAULT_AUTO_DISCOVERY.states,
	};
}

// =============================================================================
// Discovery Logic
// =============================================================================

/**
 * Run one issue discovery cycle for a project.
 * Returns what was discovered and what actions were taken.
 */
export async function discoverAndSpawn(
	projectId: string,
	project: ProjectConfig,
	deps: IssueDiscoveryDeps
): Promise<IssueDiscoveryResult> {
	const { config, registry, sessionManager, notifyHuman } = deps;
	const discoveryConfig = resolveAutoDiscoveryConfig(project);

	if (!discoveryConfig.enabled) {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	if (!project.tracker) {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	const tracker = registry.get<Tracker>("tracker", project.tracker.plugin);
	if (!tracker) {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	// 1. Get candidate issues from tracker
	if (!tracker.listIssues) {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	let candidates: DiscoveredIssue[];
	try {
		const rawIssues = await tracker.listIssues(
			{
				state: discoveryConfig.states.length > 0 ? discoveryConfig.states[0] : "open",
				labels: discoveryConfig.label ? [discoveryConfig.label] : undefined,
			},
			project
		);
		candidates = rawIssues.map(issue => ({
			id: issue.id,
			identifier: issue.id, // id doubles as identifier (e.g. "#42", "INT-123")
			title: issue.title,
			labels: issue.labels ?? [],
			state: issue.state ?? "open",
			url: issue.url,
		}));
	} catch {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	if (candidates.length === 0) {
		return { discovered: 0, spawned: 0, skipped: 0, issues: [] };
	}

	// 2. Get active sessions to filter out already-working issues
	const TERMINAL_STATUSES = new Set(["merged", "killed", "done", "errored", "terminated", "cleanup"]);
	const activeSessions = (await sessionManager.list(projectId))
		.filter(s => !TERMINAL_STATUSES.has(s.status));
	const activeIssueIds = new Set(
		activeSessions
			.filter(s => s.issueId)
			.map(s => s.issueId!.toLowerCase())
	);

	// 3. Filter and respect limits
	const maxConcurrent = discoveryConfig.maxConcurrent;
	const currentCount = activeSessions.length;
	const availableSlots = Math.max(0, maxConcurrent - currentCount);

	const result: IssueDiscoveryResult = {
		discovered: candidates.length,
		spawned: 0,
		skipped: 0,
		issues: [],
	};

	let slotsUsed = 0;

	for (const issue of candidates) {
		// Already has an active session
		if (activeIssueIds.has(issue.identifier.toLowerCase()) ||
		    activeIssueIds.has(issue.id.toLowerCase())) {
			result.skipped++;
			result.issues.push({
				id: issue.id,
				identifier: issue.identifier,
				action: "skipped_active",
			});
			continue;
		}

		// Concurrency limit reached
		if (slotsUsed >= availableSlots) {
			result.skipped++;
			result.issues.push({
				id: issue.id,
				identifier: issue.identifier,
				action: "skipped_max",
			});
			continue;
		}

		// Dry run — don't actually spawn
		if (discoveryConfig.dryRun) {
			result.issues.push({
				id: issue.id,
				identifier: issue.identifier,
				action: "skipped_dry_run",
			});
			result.skipped++;
			continue;
		}

		// Spawn!
		try {
			await sessionManager.spawn({
				projectId,
				issueId: issue.identifier,
			});

			slotsUsed++;
			result.spawned++;
			result.issues.push({
				id: issue.id,
				identifier: issue.identifier,
				action: "spawned",
			});

			// Notify human
			const event = createEvent("session.spawned", {
				sessionId: `auto-${issue.identifier}`,
				projectId,
				message: `Auto-discovered and spawned agent for ${issue.identifier}: ${issue.title}`,
				data: {
					autoDiscovery: true,
					issueId: issue.identifier,
					issueTitle: issue.title,
					issueUrl: issue.url,
				},
			});
			await notifyHuman(event, "info");
		} catch (err) {
			result.issues.push({
				id: issue.id,
				identifier: issue.identifier,
				action: "failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// Summary notification if anything was spawned
	if (result.spawned > 0) {
		const event = createEvent("session.spawned", {
			sessionId: "auto-discovery",
			projectId,
			message: `Issue Discovery: spawned ${result.spawned} new agent(s), skipped ${result.skipped} (${candidates.length} total candidates)`,
			data: {
				autoDiscovery: true,
				discovered: result.discovered,
				spawned: result.spawned,
				skipped: result.skipped,
			},
		});
		await notifyHuman(event, "action");
	}

	return result;
}

// =============================================================================
// Issue Discovery Loop (timer-based)
// =============================================================================

export interface IssueDiscoveryLoop {
	start(): void;
	stop(): void;
	/** Run one discovery cycle manually */
	runOnce(): Promise<IssueDiscoveryResult[]>;
}

export function createIssueDiscoveryLoop(
	deps: IssueDiscoveryDeps
): IssueDiscoveryLoop {
	const { config } = deps;
	const timers = new Map<string, ReturnType<typeof setInterval>>();
	const projectRunning = new Set<string>();
	let running = false;

	async function runForProject(projectId: string, project: ProjectConfig): Promise<IssueDiscoveryResult | null> {
		// Guard: prevent overlapping runs for the same project
		if (projectRunning.has(projectId)) return null;
		projectRunning.add(projectId);

		try {
			const result = await discoverAndSpawn(projectId, project, deps);

			// Log dry-run results so they're observable in the timer-driven path
			if (result.issues.some(i => i.action === "skipped_dry_run")) {
				const dryRunIssues = result.issues.filter(i => i.action === "skipped_dry_run");
				const event = createEvent("session.spawned", {
					sessionId: "auto-discovery-dry-run",
					projectId,
					message: `Issue Discovery (dry run): would spawn ${dryRunIssues.length} agent(s) for ${dryRunIssues.map(i => i.identifier).join(", ")}`,
					data: { autoDiscovery: true, dryRun: true, issues: dryRunIssues },
				});
				await deps.notifyHuman(event, "info");
			}

			return result;
		} catch {
			// Per-project errors are non-fatal
			return null;
		} finally {
			projectRunning.delete(projectId);
		}
	}

	async function runAll(): Promise<IssueDiscoveryResult[]> {
		if (running) return [];
		running = true;

		const results: IssueDiscoveryResult[] = [];

		try {
			for (const [projectId, project] of Object.entries(config.projects)) {
				const discoveryConfig = resolveAutoDiscoveryConfig(project);
				if (!discoveryConfig.enabled) continue;

				const result = await runForProject(projectId, project);
				if (result) results.push(result);
			}
		} finally {
			running = false;
		}

		return results;
	}

	return {
		start(): void {
			for (const [projectId, project] of Object.entries(config.projects)) {
				const discoveryConfig = resolveAutoDiscoveryConfig(project);
				if (!discoveryConfig.enabled) continue;

				// Don't start duplicate timers
				if (timers.has(projectId)) continue;

				const interval = discoveryConfig.intervalMs;
				timers.set(
					projectId,
					setInterval(() => void runForProject(projectId, project), interval)
				);

				// Run immediately on start
				void runForProject(projectId, project);
			}
		},

		stop(): void {
			for (const timer of timers.values()) {
				clearInterval(timer);
			}
			timers.clear();
		},

		runOnce: runAll,
	};
}
