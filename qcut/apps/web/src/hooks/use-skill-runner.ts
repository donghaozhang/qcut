import { useCallback } from "react";
import { platform } from "@qcut/platform-core";
import { toast } from "sonner";
import { useSkillsStore } from "@/stores/skills-store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { useProjectStore } from "@/stores/project-store";
import type { CliProvider } from "@/types/cli-provider";

/**
 * Provides a runSkill function that starts a skill in the PTY terminal using the configured CLI provider.
 *
 * Updates terminal active skill context, optionally updates the CLI provider and working directory,
 * switches to the PTY terminal tab, and ensures the CLI connection is started or restarted as needed.
 */

/**
 * Start the specified skill in the PTY terminal using the specified or current CLI provider.
 *
 * @param skillId - The ID of the skill to run
 * @param preferredProvider - Optional agent provider. If omitted, uses the current provider.
 * @returns No value.
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
	 * @param preferredProvider - Optional agent provider
	 *                           If not specified, uses the currently selected provider
	 */
	const runSkill = useCallback(
		async (
			skillId: string,
			preferredProvider?: Exclude<CliProvider, "shell">
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

			// A plain shell cannot execute skills, so an omitted provider must
			// never resolve to it; fall back to the default agent provider.
			const providerToUse: Exclude<CliProvider, "shell"> =
				preferredProvider ?? (cliProvider === "shell" ? "claude" : cliProvider);

			// 1. Get the project's skills folder path
			let skillsPath = "";
			try {
				skillsPath = await platform().skills.getPath(activeProject.id);
			} catch {
				// Ignore - skills path is optional
			}

			// 2. Set skill as active context
			setActiveSkill({
				id: skill.id,
				name: skill.name,
				content: skill.content,
				folderName: skill.folderName, // For OpenRouter --project-doc flag
			});

			// 3. Ensure the terminal uses a skill-capable provider
			if (providerToUse !== cliProvider) {
				setCliProvider(providerToUse);
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
