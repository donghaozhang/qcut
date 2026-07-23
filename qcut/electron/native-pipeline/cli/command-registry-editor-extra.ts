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
	const pointerTargetFlags = () => [
		f("--target", "string", "Semantic target, for example panel.text"),
		f("--ref", "string", "Snapshot ref, for example @e12"),
		f("--x", "number", "Editor viewport X coordinate"),
		f("--y", "number", "Editor viewport Y coordinate"),
		f("--normalized-x", "number", "Horizontal viewport ratio from 0 to 1"),
		f("--normalized-y", "number", "Vertical viewport ratio from 0 to 1"),
		f("--wait-for", "string", "Wait for a semantic target or visible text"),
		f("--timeout-ms", "number", "Target wait timeout in milliseconds", {
			default: 5000,
		}),
		f("--speed", "number", "Pointer animation speed multiplier", {
			default: 1,
		}),
		f(
			"--foreground",
			"boolean",
			"Focus QCut and use native Electron input instead of background input",
			{ default: false }
		),
	];

	return {
		"editor:demo:run": ed(
			"editor:demo:run",
			"Prepare, record, export, and verify an editor demo from one plan",
			[
				f("--plan", "string", "Demo plan JSON file", { required: true }),
				f("--record", "string", "Screen recording output MP4"),
				f("--event-track", "string", "Editable pointer event-track JSON"),
				f("--speed", "number", "Overall animation speed multiplier", {
					default: 1,
				}),
				f("--skip-idle", "boolean", "Skip sleep and idle-only actions", {
					default: false,
				}),
				f("--project-id", "string", "Use an existing project"),
				f("--timeout-ms", "number", "Project readiness timeout", {
					default: 15000,
				}),
			],
			[
				"qcut editor demo run --plan promo.json --record demo.mp4 --speed 1.5 --skip-idle --json",
			]
		),
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
						"audio",
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
		"editor:ui:wait": ed(
			"editor:ui:wait",
			"Wait until visible UI state matches a ref, text, or value",
			[
				f("--ref", "string", "Snapshot ref to wait for"),
				f("--text", "string", "Visible name or text to wait for"),
				f("--value", "string", "Exact input value for --ref"),
				f("--timeout-ms", "number", "Timeout in milliseconds", {
					default: 5000,
				}),
				f("--interval-ms", "number", "Polling interval in milliseconds", {
					default: 100,
				}),
			],
			[
				'qcut-pipeline editor ui wait --text "Auto-saved" --timeout-ms 5000 --json',
			]
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
		"editor:snapshot:select": ed(
			"editor:snapshot:select",
			"Select an option from a dropdown by ref",
			[
				f("--ref", "string", "Snapshot ref (for example @e12)", {
					required: true,
				}),
				f("--value", "string", "Option value or text to select", {
					required: true,
				}),
			],
			['qcut-pipeline editor:snapshot:select --ref @e12 --value "720p" --json']
		),
		"editor:snapshot:check": ed(
			"editor:snapshot:check",
			"Toggle a checkbox or switch by ref",
			[
				f("--ref", "string", "Snapshot ref (for example @e12)", {
					required: true,
				}),
				f("--checked", "boolean", "Desired checked state (true/false)", {
					required: true,
				}),
			],
			[
				"qcut-pipeline editor:snapshot:check --ref @e12 --checked --json",
				"qcut-pipeline editor:snapshot:check --ref @e12 --no-checked --json",
			]
		),
		"editor:pointer:move": ed(
			"editor:pointer:move",
			"Move the visible Agent pointer without activating QCut by default",
			pointerTargetFlags(),
			[
				"qcut-pipeline editor:pointer:move --ref @e12 --json",
				"qcut-pipeline editor:pointer:move --x 640 --y 360 --json",
			]
		),
		"editor:pointer:hover": ed(
			"editor:pointer:hover",
			"Move the Agent pointer and settle long enough to trigger hover UI",
			pointerTargetFlags(),
			["qcut-pipeline editor:pointer:hover --ref @e12 --json"]
		),
		"editor:pointer:click": ed(
			"editor:pointer:click",
			"Click with real Electron mouseDown and mouseUp events",
			pointerTargetFlags(),
			["qcut-pipeline editor:pointer:click --ref @e12 --force --json"]
		),
		"editor:pointer:double-click": ed(
			"editor:pointer:double-click",
			"Double-click with real Electron input events",
			pointerTargetFlags(),
			["qcut-pipeline editor:pointer:double-click --ref @e12 --force --json"]
		),
		"editor:pointer:right-click": ed(
			"editor:pointer:right-click",
			"Open a context menu with a real right-click sequence",
			pointerTargetFlags(),
			["qcut-pipeline editor:pointer:right-click --ref @e12 --force --json"]
		),
		"editor:pointer:drag": ed(
			"editor:pointer:drag",
			"Drag between snapshot refs or editor coordinates",
			[
				f("--from", "string", "Semantic starting target"),
				f("--to", "string", "Semantic destination target"),
				f("--from-ref", "string", "Starting snapshot ref"),
				f("--to-ref", "string", "Destination snapshot ref"),
				f("--from-x", "number", "Starting editor viewport X coordinate"),
				f("--from-y", "number", "Starting editor viewport Y coordinate"),
				f("--to-x", "number", "Destination editor viewport X coordinate"),
				f("--to-y", "number", "Destination editor viewport Y coordinate"),
				f("--from-normalized-x", "number", "Starting viewport X ratio"),
				f("--from-normalized-y", "number", "Starting viewport Y ratio"),
				f("--to-normalized-x", "number", "Destination viewport X ratio"),
				f("--to-normalized-y", "number", "Destination viewport Y ratio"),
				f(
					"--to-time",
					"number",
					"Directly seek the timeline, then animate the pointer to the playhead"
				),
				f("--to-index", "number", "Destination index in the source list"),
				f("--via", "string", "JSON array or @file of intermediate targets"),
				f("--hold-ms", "number", "Pause after mouseDown", { default: 120 }),
				f("--duration-ms", "number", "Total movement duration", {
					default: 450,
				}),
				f("--steps", "number", "Movement steps", { default: 24 }),
				f("--release-delay-ms", "number", "Pause before mouseUp", {
					default: 100,
				}),
				f("--verify", "boolean", "Verify the resulting list index", {
					default: true,
				}),
				f("--wait-for", "string", "Wait for a semantic target or visible text"),
				f("--timeout-ms", "number", "Target wait timeout in milliseconds", {
					default: 5000,
				}),
				f("--speed", "number", "Pointer animation speed multiplier", {
					default: 1,
				}),
				f(
					"--foreground",
					"boolean",
					"Focus QCut and use native Electron input instead of background input",
					{ default: false }
				),
			],
			[
				"qcut-pipeline editor:pointer:drag --from-ref @e12 --to-ref @e27 --force --json",
				"qcut-pipeline editor:pointer:drag --from-x 400 --from-y 700 --to-x 700 --to-y 700 --force --json",
			]
		),
		"editor:pointer:wait-for": ed(
			"editor:pointer:wait-for",
			"Wait for a semantic pointer target or visible editor text",
			[
				f("--target", "string", "Semantic target"),
				f("--text", "string", "Visible text"),
				f("--timeout-ms", "number", "Timeout in milliseconds", {
					default: 5000,
				}),
				f("--interval-ms", "number", "Polling interval in milliseconds", {
					default: 100,
				}),
			],
			["qcut editor pointer wait-for --target panel.text --json"]
		),
		"editor:pointer:scroll": ed(
			"editor:pointer:scroll",
			"Scroll at the current pointer, a snapshot ref, or editor coordinate",
			[
				...pointerTargetFlags(),
				f("--delta-x", "number", "Horizontal wheel delta"),
				f("--delta-y", "number", "Vertical wheel delta"),
			],
			["qcut-pipeline editor:pointer:scroll --delta-y 400 --json"]
		),
		"editor:pointer:hide": ed(
			"editor:pointer:hide",
			"Hide the Agent pointer overlay",
			[],
			["qcut-pipeline editor:pointer:hide --json"]
		),
		"editor:pointer:sequence": ed(
			"editor:pointer:sequence",
			"Run pointer, keyboard, wait, and snapshot actions in one session",
			[
				f("--actions", "string", "JSON action array or @file", {
					required: true,
				}),
				f("--record", "string", "Record the Agent pointer sequence to video"),
				f(
					"--event-track",
					"string",
					"Write an editable JSON pointer event track"
				),
				f("--speed", "number", "Overall animation speed multiplier", {
					default: 1,
				}),
				f("--skip-idle", "boolean", "Skip sleep and idle-only actions", {
					default: false,
				}),
				f("--foreground", "boolean", "Use foreground native input", {
					default: false,
				}),
			],
			[
				"qcut-pipeline editor pointer sequence --actions @demo-actions.json --record demo.mp4 --json",
			]
		),
		"editor:keyboard:press": ed(
			"editor:keyboard:press",
			"Press a comma-separated key or shortcut sequence",
			[
				f("--keys", "string", "Keys, for example Space,ArrowUp,Meta+S", {
					required: true,
				}),
				f("--interval-ms", "number", "Delay between keys", { default: 45 }),
				f("--foreground", "boolean", "Use foreground native input", {
					default: false,
				}),
			]
		),
		"editor:keyboard:type": ed(
			"editor:keyboard:type",
			"Type text into the focused editor control",
			[
				f("--text", "string", "Text to type", { required: true }),
				f("--interval-ms", "number", "Delay between characters"),
				f("--foreground", "boolean", "Use foreground native input", {
					default: false,
				}),
			]
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
		"editor:diff:screenshot": ed(
			"editor:diff:screenshot",
			"Pixel-diff two screenshot PNG files",
			[
				f("--before", "string", "Path to the earlier screenshot PNG", {
					required: true,
				}),
				f("--after", "string", "Path to the later screenshot PNG", {
					required: true,
				}),
				f(
					"--threshold",
					"number",
					"Per-channel difference threshold (0-255, default 10)",
					{ default: 10 }
				),
			],
			[
				"qcut-pipeline editor:diff:screenshot --before before.png --after after.png --json",
				"qcut-pipeline editor:diff:screenshot --before a.png --after b.png --threshold 20 --json",
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

		"editor:session:list": ed(
			"editor:session:list",
			"List all saved CLI sessions",
			[],
			["qcut-pipeline editor:session:list --json"]
		),
		"editor:session:delete": ed(
			"editor:session:delete",
			"Delete a saved CLI session",
			[
				f("--session-name", "string", "Session name to delete", {
					required: true,
				}),
			],
			[
				"qcut-pipeline editor:session:delete --session-name my-edit-session --json",
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
