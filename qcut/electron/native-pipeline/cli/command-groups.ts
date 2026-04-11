/**
 * Command Group Router — hierarchical `<group> <action>` dispatch.
 *
 * Maps resource-first groups (e.g. `gen image`) to internal
 * command names (e.g. `generate-image`). The resolver runs before
 * flat command lookup, falling through if no group matches.
 *
 * @module electron/native-pipeline/cli/command-groups
 */

export interface CommandGroup {
	/** Short group name used on CLI (e.g. "gen") */
	name: string;
	/** Human-readable label for help output */
	label: string;
	/** One-line description for help output */
	description: string;
	/** Maps action name → internal command name */
	actions: Record<string, string>;
}

export const COMMAND_GROUPS: CommandGroup[] = [
	{
		name: "gen",
		label: "Generation",
		description: "Generate images, videos, avatars, music, and grids",
		actions: {
			image: "generate-image",
			video: "create-video",
			avatar: "generate-avatar",
			grid: "generate-grid",
			remotion: "generate-remotion",
		},
	},
	{
		name: "analyze",
		label: "Analysis",
		description: "Analyze video, image, or query media content",
		actions: {
			video: "analyze-video",
			query: "query-video",
		},
	},
	{
		name: "audio",
		label: "Audio & Language",
		description: "Transcribe, translate, and synthesize speech",
		actions: {
			transcribe: "transcribe",
			translate: "translate-video",
			tts: "generate-speech",
			convert: "convert-speech",
			clone: "clone-voice",
		},
	},
	{
		name: "edit",
		label: "Editing & Production",
		description: "Autoclip, upscale, motion transfer, and compositing",
		actions: {
			autoclip: "autoclip",
			upscale: "upscale-image",
			motion: "transfer-motion",
			stamp: "stamp-image",
			subtitle: "subtitle-style",
			"subtitle-export": "subtitle-export",
			"clean-audio": "clean-audio",
		},
	},
	{
		name: "flow",
		label: "Workflows & Orchestration",
		description: "ViMax pipelines, YAML workflows, script/character generation",
		actions: {
			run: "run-pipeline",
			status: "pipeline:status",
			idea2video: "vimax:idea2video",
			script2video: "vimax:script2video",
			novel2movie: "vimax:novel2movie",
			script: "vimax:generate-script",
			characters: "vimax:extract-characters",
			portraits: "vimax:generate-portraits",
			storyboard: "vimax:generate-storyboard",
			"registry-create": "vimax:create-registry",
			"registry-show": "vimax:show-registry",
		},
	},
	{
		name: "system",
		label: "System & Configuration",
		description: "Auth, keys, models, project setup, and diagnostics",
		actions: {
			login: "login",
			signup: "signup",
			logout: "logout",
			setup: "setup",
			"set-key": "set-key",
			"get-key": "get-key",
			"delete-key": "delete-key",
			"check-keys": "check-keys",
			models: "list-models",
			"models-video": "list-video-models",
			"models-avatar": "list-avatar-models",
			"models-motion": "list-motion-models",
			"models-speech": "list-speech-models",
			cost: "estimate-cost",
			"project-init": "init-project",
			"project-organize": "organize-project",
			"project-info": "structure-info",
			examples: "create-examples",
		},
	},
];

/** Set of group names for fast lookup. */
const GROUP_NAMES = new Set(COMMAND_GROUPS.map((g) => g.name));

/**
 * Resolve a group+action pair to an internal command name.
 *
 * @returns The internal command name and remaining args, or null
 *          if argv doesn't match any group pattern.
 *
 * @example
 *   resolveCommandGroup(["gen", "image", "--prompt", "cat"])
 *   // → { command: "generate-image", remainingArgs: ["--prompt", "cat"] }
 */
export function resolveCommandGroup(argv: string[]): {
	command: string;
	remainingArgs: string[];
} | null {
	if (argv.length < 1) return null;

	const [groupName, actionName, ...rest] = argv;

	// If first arg isn't a known group, bail early
	if (!GROUP_NAMES.has(groupName)) return null;

	const group = COMMAND_GROUPS.find((g) => g.name === groupName);
	if (!group) return null;

	// "qcut gen --help" — no action, show group help (handled by caller)
	if (!actionName || actionName.startsWith("-")) return null;

	const command = group.actions[actionName];
	if (!command) return null;

	return { command, remainingArgs: rest };
}

/**
 * Check if a string is a known command group name.
 * Used by the CLI entry point to show group-level help.
 */
export function isCommandGroup(name: string): boolean {
	return GROUP_NAMES.has(name);
}

/**
 * Get a command group by name.
 */
export function getCommandGroup(name: string): CommandGroup | undefined {
	return COMMAND_GROUPS.find((g) => g.name === name);
}
