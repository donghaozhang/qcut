/**
 * Command Alias & Deprecation System.
 *
 * Maps old flat command names to their new group-based equivalents.
 * Emits deprecation warnings to stderr when old names are used directly.
 *
 * @module electron/native-pipeline/cli/aliases
 */

/**
 * Maps old flat command names to their suggested group-based form.
 * Only includes commands that have a group equivalent.
 */
export const COMMAND_ALIASES: Record<string, string> = {
	"generate-image": "gen image",
	"create-video": "gen video",
	"generate-avatar": "gen avatar",
	"generate-grid": "gen grid",
	"generate-remotion": "gen remotion",
	"analyze-video": "analyze video",
	"query-video": "analyze query",
	"transcribe": "audio transcribe",
	"translate-video": "audio translate",
	"generate-speech": "audio tts",
	"convert-speech": "audio convert",
	"clone-voice": "audio clone",
	"autoclip": "edit autoclip",
	"upscale-image": "edit upscale",
	"transfer-motion": "edit motion",
	"stamp-image": "edit stamp",
	"subtitle-style": "edit subtitle",
	"subtitle-export": "edit subtitle-export",
	"clean-audio": "edit clean-audio",
	"run-pipeline": "flow run",
	"pipeline:status": "flow status",
	"vimax:idea2video": "flow idea2video",
	"vimax:script2video": "flow script2video",
	"vimax:novel2movie": "flow novel2movie",
	"vimax:generate-script": "flow script",
	"vimax:extract-characters": "flow characters",
	"vimax:generate-portraits": "flow portraits",
	"vimax:generate-storyboard": "flow storyboard",
	"vimax:create-registry": "flow registry-create",
	"vimax:show-registry": "flow registry-show",
	"list-models": "system models",
	"list-video-models": "system models-video",
	"list-avatar-models": "system models-avatar",
	"list-motion-models": "system models-motion",
	"list-speech-models": "system models-speech",
	"estimate-cost": "system cost",
	"login": "system login",
	"signup": "system signup",
	"logout": "system logout",
	"setup": "system setup",
	"set-key": "system set-key",
	"get-key": "system get-key",
	"delete-key": "system delete-key",
	"check-keys": "system check-keys",
	"init-project": "system project-init",
	"organize-project": "system project-organize",
	"structure-info": "system project-info",
	"create-examples": "system examples",
};

/**
 * Emit a deprecation warning to stderr if the command was invoked
 * via an old flat name (not through the group router).
 *
 * @param commandName - The internal command name
 * @param wasGroupResolved - True if resolved via `gen image` style
 * @param quiet - Suppress warnings (--json or --quiet mode)
 */
export function warnIfDeprecated(
	commandName: string,
	wasGroupResolved: boolean,
	quiet = false,
): void {
	if (wasGroupResolved || quiet) return;

	const suggestion = COMMAND_ALIASES[commandName];
	if (!suggestion) return;

	console.error(
		`\x1b[33m\u26A0 DEPRECATED:\x1b[0m "${commandName}" \u2192 use "qcut ${suggestion}" instead.`,
	);
}
