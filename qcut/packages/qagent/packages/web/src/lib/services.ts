/**
 * Server-side singleton for core services.
 *
 * Lazily initializes config, plugin registry, and session manager.
 * Cached in globalThis to survive Next.js HMR reloads in development.
 *
 * NOTE: Plugins are explicitly imported here because Next.js webpack
 * cannot resolve dynamic `import(variable)` expressions used by the
 * core plugin registry's loadBuiltins(). Static imports let webpack
 * bundle them correctly.
 */

import {
	loadConfig,
	createPluginRegistry,
	createSessionManager,
	type OrchestratorConfig,
	type PluginRegistry,
	type PluginModule,
	type SessionManager,
	type SCM,
	type ProjectConfig,
} from "@composio/ao-core";

// Static plugin imports — webpack needs these to be string literals
import pluginRuntimeTmux from "@composio/ao-plugin-runtime-tmux";
import pluginAgentClaudeCode from "@composio/ao-plugin-agent-claude-code";
import pluginWorkspaceWorktree from "@composio/ao-plugin-workspace-worktree";
import pluginScmGithub from "@composio/ao-plugin-scm-github";
import pluginTrackerGithub from "@composio/ao-plugin-tracker-github";

export interface Services {
	config: OrchestratorConfig;
	registry: PluginRegistry;
	sessionManager: SessionManager;
}

// Cache in globalThis for Next.js HMR stability
const globalForServices = globalThis as typeof globalThis & {
	_aoServices?: Services;
	_aoServicesInit?: Promise<Services>;
};

/** Get (or lazily initialize) the core services singleton. */
export function getServices(): Promise<Services> {
	if (globalForServices._aoServices) {
		return Promise.resolve(globalForServices._aoServices);
	}
	if (!globalForServices._aoServicesInit) {
		globalForServices._aoServicesInit = initServices().catch((err) => {
			// Clear the cached promise so the next call retries instead of
			// permanently returning a rejected promise.
			globalForServices._aoServicesInit = undefined;
			throw err;
		});
	}
	return globalForServices._aoServicesInit;
}

async function initServices(): Promise<Services> {
	const config = loadConfig();
	const registry = createPluginRegistry();

	// Register plugins explicitly (webpack can't handle dynamic import() in core)
	registry.register(pluginRuntimeTmux);
	registry.register(pluginAgentClaudeCode);
	registry.register(pluginWorkspaceWorktree);
	registry.register(pluginScmGithub);
	registry.register(pluginTrackerGithub);
	await registerOptionalLinearTracker({ registry, config });

	const sessionManager = createSessionManager({ config, registry });

	const services = { config, registry, sessionManager };
	globalForServices._aoServices = services;
	return services;
}

function isPluginModule(value: unknown): value is PluginModule {
	try {
		if (!value || typeof value !== "object") {
			return false;
		}
		const module = value as Record<string, unknown>;
		const manifest = module.manifest as Record<string, unknown> | undefined;
		const create = module.create;
		return (
			Boolean(manifest) &&
			typeof manifest?.name === "string" &&
			typeof manifest?.slot === "string" &&
			typeof create === "function"
		);
	} catch {
		return false;
	}
}

async function registerOptionalLinearTracker({
	registry,
	config,
}: {
	registry: PluginRegistry;
	config: OrchestratorConfig;
}): Promise<void> {
	const needsLinearTracker = Object.values(config.projects).some(
		(project) => project.tracker?.plugin === "linear"
	);
	if (!needsLinearTracker) {
		return;
	}

	try {
		// Keep Linear optional in web builds where @composio/core may be absent.
		const maybeModule = await import(
			/* webpackIgnore: true */ "@composio/ao-plugin-tracker-linear"
		);
		const plugin = (maybeModule as { default?: unknown }).default;
		if (isPluginModule(plugin)) {
			registry.register(plugin);
			return;
		}
		console.warn(
			"[ao-web] Linear tracker plugin was requested but did not export a valid plugin module."
		);
	} catch (error) {
		console.warn(
			`[ao-web] Linear tracker plugin is unavailable: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/** Resolve the SCM plugin for a project. Returns null if not configured. */
export function getSCM(
	registry: PluginRegistry,
	project: ProjectConfig | undefined
): SCM | null {
	if (!project?.scm) return null;
	return registry.get<SCM>("scm", project.scm.plugin);
}
