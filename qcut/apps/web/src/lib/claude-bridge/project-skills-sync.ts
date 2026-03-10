import { platform } from "@qcut/platform-core";

interface SyncProjectSkillsForClaudeInput {
	projectId: string;
}

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
