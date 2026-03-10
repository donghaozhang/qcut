import { useCallback } from "react";
import { platform } from "@qcut/platform-core";
import { toast } from "sonner";
import { useSkillsStore } from "@/stores/skills-store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { useProjectStore } from "@/stores/project-store";
import type { CliProvider } from "@/types/cli-provider";

/**
 * Hook to run a skill with the configured CLI provider.
 *
 * When a skill is run:
 * 1. Sets the skill as active context in the PTY terminal store
 * 2. Sets the CLI provider (Gemini, Codex, or Claude if specified)
 * 3. Sets the working directory to the project's skills folder
 * 4. Switches to the PTY terminal tab
 * 5. Auto-connects if not already connected
 * 6. For Gemini: Sends the skill prompt after connection
 * 7. For Codex: Skill is injected via --project-doc flag at spawn time
 * 8. For Claude: Skill is injected via --append-system-prompt flag at spawn time
 */
export function useSkillRunner() {
	const { skills } = useSkillsStore();
	const { activeProject } = useProjectStore();
	const {
		setActiveSkill,
		setCliProvider,
		setWorkingDirectory,
		connect,
		disconnect,
		status,
		cliProvider,
	} = usePtyTerminalStore();
	const { setActiveTab } = useMediaPanelStore();

	/**
	 * Run a skill with the specified or current CLI provider.
	 *
	 * @param skillId - The ID of the skill to run
	 * @param preferredProvider - Optional provider to use ("gemini", "codex", or "claude")
	 *                           If not specified, uses the currently selected provider
	 */
	const runSkill = useCallback(
		async (
			skillId: string,
			preferredProvider?: "gemini" | "codex" | "claude"
		) => {
			const skill = skills.find((s) => s.id === skillId);
			if (!skill) {
				toast.error("Skill not found");
				return;
			}

			if (!activeProject) {
				toast.error("No active project");
				return;
			}

			const providerToUse: CliProvider = preferredProvider || cliProvider;

			// 1. Get the project's skills folder path
			let skillsPath = "";
			try {
				skillsPath = await platform().skills.getPath(activeProject.id);
			} catch {
				// Ignore - skills path is optional
			}

			// 2. Set skill as active context (used by both providers)
			setActiveSkill({
				id: skill.id,
				name: skill.name,
				content: skill.content,
				folderName: skill.folderName, // For Codex --project-doc flag
			});

			// 3. Set provider if specified
			if (preferredProvider) {
				setCliProvider(preferredProvider);
			}

			// 4. Set working directory to project folder (parent of skills folder)
			if (skillsPath) {
				// Get project folder by removing the trailing "skills" directory
				const projectPath = skillsPath.replace(/[/\\]skills$/, "");
				setWorkingDirectory(projectPath);
			}

			// 5. Switch to PTY terminal tab
			setActiveTab("pty");

			// 6. If already connected, disconnect first to restart with new working directory/provider
			if (status === "connected") {
				await disconnect();
				// Small delay before reconnecting
				await new Promise((resolve) => setTimeout(resolve, 200));
				await connect();
			} else if (status !== "connecting") {
				// Auto-start CLI if not connected
				await connect();
			}
		},
		[
			skills,
			activeProject,
			setActiveSkill,
			setCliProvider,
			setWorkingDirectory,
			setActiveTab,
			connect,
			disconnect,
			status,
			cliProvider,
		]
	);

	return { runSkill };
}
