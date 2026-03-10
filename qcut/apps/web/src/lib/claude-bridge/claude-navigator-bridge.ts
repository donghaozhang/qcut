/**
 * Claude Navigator Bridge
 *
 * Handles project listing and navigation requests from the main process.
 * Enables the CLI to list projects and open the editor view.
 *
 * @module lib/claude-bridge/claude-navigator-bridge
 */

import { useProjectStore } from "@/stores/project-store";
import { platform } from "@qcut/platform-core";

const DEBUG = true;
const PREFIX = "[ClaudeNavigatorBridge]";

function debugLog(...args: unknown[]): void {
	if (DEBUG) console.log(PREFIX, ...args);
}

function debugWarn(...args: unknown[]): void {
	console.warn(PREFIX, ...args);
}

function debugError(...args: unknown[]): void {
	console.error(PREFIX, ...args);
}

/**
 * Register navigation handlers with the Claude Navigator API to respond to project list and open requests.
 *
 * If the platform Claude navigator is unavailable, no handlers are registered. The registered handlers
 * send project lists (including ISO string dates) and the active project id in responses, and navigate
 * the application to the editor view by updating window.location.hash when an open request is handled.
 */
export function setupClaudeNavigatorBridge(): void {
	const navAPI = platform().claude?.navigator;
	if (!navAPI) {
		debugWarn("Claude Navigator API not available");
		return;
	}

	debugLog("Setting up bridge...");

	// Handle project list request
	navAPI.onProjectsRequest(async (data: { requestId: string }) => {
		try {
			debugLog("Received projects list request");
			const projectStore = useProjectStore.getState();

			// Ensure projects are loaded
			if (!projectStore.isInitialized) {
				await projectStore.loadAllProjects();
			}

			const projects = projectStore.savedProjects.map((p) => ({
				id: p.id,
				name: p.name,
				createdAt:
					p.createdAt instanceof Date
						? p.createdAt.toISOString()
						: String(p.createdAt),
				updatedAt:
					p.updatedAt instanceof Date
						? p.updatedAt.toISOString()
						: String(p.updatedAt),
			}));

			const activeProjectId = projectStore.activeProject?.id ?? null;

			navAPI.sendProjectsResponse(data.requestId, {
				projects,
				activeProjectId,
			});
			debugLog("Sent projects response:", projects.length, "projects");
		} catch (error) {
			debugError("Failed to list projects:", error);
			navAPI.sendProjectsResponse(data.requestId, {
				projects: [],
				activeProjectId: null,
			});
		}
	});

	// Handle navigate-to-project request
	navAPI.onOpenRequest(
		async (data: { requestId: string; projectId: string }) => {
			try {
				debugLog("Received navigate request:", data.projectId);

				const projectStore = useProjectStore.getState();

				// Ensure projects are loaded so we can validate
				if (!projectStore.isInitialized) {
					await projectStore.loadAllProjects();
				}

				const project = projectStore.savedProjects.find(
					(p) => p.id === data.projectId
				);

				if (!project) {
					debugWarn("Project not found:", data.projectId);
					navAPI.sendOpenResponse(data.requestId, {
						navigated: false,
						projectId: data.projectId,
					});
					return;
				}

				// Navigate using hash routing (TanStack Router uses createHashHistory)
				window.location.hash = `#/editor/${data.projectId}`;

				navAPI.sendOpenResponse(data.requestId, {
					navigated: true,
					projectId: data.projectId,
				});
				debugLog("Navigation initiated:", data.projectId);
			} catch (error) {
				debugError("Failed to navigate:", error);
				navAPI.sendOpenResponse(data.requestId, {
					navigated: false,
					projectId: data.projectId,
				});
			}
		}
	);

	debugLog("Bridge setup complete");
}

/**
 * Remove any registered Claude navigator event listeners from the platform, if present.
 */
export function cleanupClaudeNavigatorBridge(): void {
	platform().claude?.navigator?.removeListeners?.();
	debugLog("Bridge cleanup complete");
}
