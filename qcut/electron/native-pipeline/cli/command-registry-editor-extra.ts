import type { FlagDef, CommandDef } from "./command-registry-types.js";

export function createExtraEditorCommands({
	f,
	ed,
}: {
	f: (
		name: string,
		type: FlagDef["type"],
		desc: string,
		opts?: Partial<FlagDef>
	) => FlagDef;
	ed: (
		name: string,
		description: string,
		flags: FlagDef[],
		examples?: string[]
	) => CommandDef;
}): Record<string, CommandDef> {
	return {
		// ── Auth ──
		"editor:auth:token": ed(
			"editor:auth:token",
			"Auth: Get or set the current auth token",
			[
				f("--set", "string", "Set token to this value"),
				f("--reveal", "boolean", "Show full token (default: masked)", {
					default: false,
				}),
			],
			[
				"qcut-pipeline editor:auth:token --json",
				"qcut-pipeline editor:auth:token --reveal --json",
				"qcut-pipeline editor:auth:token --set <token> --json",
			]
		),
		"editor:auth:activate": ed(
			"editor:auth:activate",
			"Auth: Set token and activate license on this device",
			[f("--token", "string", "Auth token", { required: true })],
			["qcut-pipeline editor:auth:activate --token <token> --json"]
		),
		"editor:auth:logout": ed(
			"editor:auth:logout",
			"Auth: Clear the current auth token",
			[],
			["qcut-pipeline editor:auth:logout --json"]
		),
		"editor:health": ed("editor:health", "Check editor connectivity", [
			f("--status-only", "boolean", "Return compact status output", {
				default: false,
			}),
			f("--deep", "boolean", "Run deep cross-process health probes", {
				default: false,
			}),
		]),

		// ── UI ──
		"editor:ui:switch-panel": ed(
			"editor:ui:switch-panel",
			"Switch editor panel",
			[
				f("--panel", "string", "Panel name", {
					required: true,
					enum: [
						"media",
						"text",
						"stickers",
						"video-edit",
						"effects",
						"transitions",
						"filters",
						"text2image",
						"nano-edit",
						"ai",
						"sounds",
						"segmentation",
						"remotion",
						"pty",
						"word-timeline",
						"project-folder",
						"upscale",
						"moyin",
						"properties",
						"export",
						"api-keys",
					],
				}),
				f("--tab", "string", "Inner tab (for moyin panel)", {
					enum: ["overview", "characters", "scenes", "shots", "generate"],
				}),
			]
		),
		"editor:ui:context-menu": ed(
			"editor:ui:context-menu",
			"Dispatch a right-click context menu on a timeline element (debug)",
			[
				f("--element-id", "string", "Timeline element ID", { required: true }),
				f(
					"--verbose",
					"boolean",
					"Capture all pointer/mouse events for debugging"
				),
			],
			["qcut-pipeline editor:ui:context-menu --element-id <id> --verbose"]
		),
		"editor:snapshot": ed(
			"editor:snapshot",
			"Get a ref-based accessibility snapshot of the visible editor UI",
			[
				f("--interactive", "boolean", "Only include actionable UI elements", {
					default: false,
				}),
				f("--depth", "number", "Maximum DOM traversal depth"),
			],
			[
				"qcut-pipeline editor:snapshot --json",
				"qcut-pipeline editor:snapshot --interactive --depth 2 --json",
			]
		),
		"editor:snapshot:click": ed(
			"editor:snapshot:click",
			"Click a UI element from the latest snapshot by ref",
			[
				f("--ref", "string", "Snapshot ref (for example @e12)", {
					required: true,
				}),
			],
			["qcut-pipeline editor:snapshot:click --ref @e12 --json"]
		),
		"editor:snapshot:fill": ed(
			"editor:snapshot:fill",
			"Fill a text input from the latest snapshot by ref",
			[
				f("--ref", "string", "Snapshot ref (for example @e12)", {
					required: true,
				}),
				f("--text", "string", "Text value to enter", { required: true }),
			],
			['qcut-pipeline editor:snapshot:fill --ref @e12 --text "hello" --json']
		),
		"editor:diff:snapshot": ed(
			"editor:diff:snapshot",
			"Compare two saved accessibility snapshot files",
			[
				f("--before", "string", "Path to the earlier snapshot JSON", {
					required: true,
				}),
				f("--after", "string", "Path to the later snapshot JSON", {
					required: true,
				}),
			],
			[
				"qcut-pipeline editor:diff:snapshot --before before.json --after after.json --json",
			]
		),
		"editor:session:save": ed(
			"editor:session:save",
			"Save sticky CLI session state to disk",
			[
				f(
					"--session-name",
					"string",
					"Saved session name (defaults to active --resume session)"
				),
				f(
					"--project-id",
					"string",
					"Project ID override for the saved session"
				),
				f("--panel", "string", "Panel override for the saved session"),
				f("--tab", "string", "Tab override for the saved session"),
			],
			[
				"qcut-pipeline editor:session:save --session-name my-edit-session --project-id <id> --json",
				"qcut-pipeline editor:session:save --resume my-edit-session --json",
			]
		),
		"editor:session:load": ed(
			"editor:session:load",
			"Load a saved CLI session state",
			[f("--session-name", "string", "Saved session name", { required: true })],
			[
				"qcut-pipeline editor:session:load --session-name my-edit-session --json",
			]
		),

		// ── Screenshot ──
		"editor:screenshot:capture": ed(
			"editor:screenshot:capture",
			"Take a screenshot of QCut window",
			[f("--filename", "string", "Output filename")]
		),
	};
}
