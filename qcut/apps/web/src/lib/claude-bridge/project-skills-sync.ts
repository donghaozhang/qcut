import { platform } from "@qcut/platform-core";

interface SyncProjectSkillsForClaudeInput {
	projectId: string;
}

/**
 * Initiates syncing of a project's skills with Claude.
 *
 * If the platform integration is unavailable the function returns immediately.
 * If the sync operation fails, a warning is logged.
 *
 * @param projectId - The project identifier whose skills should be synchronized
 */
export function syncProjectSkillsForClaude({
	projectId,
}: SyncProjectSkillsForClaudeInput): void {
	try {
		const syncForClaude = platform().skills?.syncForClaude;
		if (!syncForClaude) {
			return;
		}
		syncForClaude(projectId).catch((error: unknown) => {
			console.warn("[ProjectStore] skills syncForClaude failed", error);
		});
	} catch (error: unknown) {
		console.warn("[ProjectStore] skills syncForClaude failed", error);
	}
}
