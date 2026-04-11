import {
	COMMANDS_REGISTRY,
	CATEGORIES,
	GLOBAL_FLAGS,
	getCommand,
	getCommandFlag,
} from "./command-registry.js";
import { COMMAND_GROUPS } from "./command-groups.js";
import { jsonError, jsonOk } from "./json-output.js";

export const CLI_VERSION = "1.0.0";

/** Detect CLI binary name from process.argv. */
export function getCliName(): string {
	const scriptPath = process.argv[1] ?? "";
	if (scriptPath.endsWith("/qcut") || scriptPath.endsWith("\\qcut")) {
		return "qcut";
	}
	return "qcut-pipeline";
}

/** Handle print help — shows group-based taxonomy as primary. */
export function printHelp(): void {
	const bin = getCliName();
	// Build group listing
	const groupLines = COMMAND_GROUPS.map(
		(g) => `  ${g.name.padEnd(12)} ${g.description}`,
	).join("\n");

	console.log(
		`
${bin} v${CLI_VERSION} — AI content generation CLI

Usage:
  ${bin} <group> <action> [options]
  ${bin} <command> [options]          (legacy)

Groups:
${groupLines}

Run "${bin} <group> --help" for group details.

Editor Commands (requires running QCut — use --project-id for most):
  editor:health, editor:console, editor:errors, editor:undo, editor:redo,
  editor:media:*, editor:project:*, editor:timeline:*, editor:editing:*,
  editor:analyze:*, editor:transcribe:*, editor:search:*, editor:generate:*,
  editor:export:*, editor:remotion:*, editor:snapshot:*, editor:screenshot:*,
  editor:diff:*, editor:session:*, editor:screen-recording:*, editor:state:*,
  editor:sticker:*, editor:moyin:*, editor:novel:*, editor:navigator:*,
  editor:auth:*, editor:diagnostics:*, editor:mcp:forward-html,
  editor:ui:switch-panel, editor:ui:context-menu

  Use <command> --help --json for detailed flag info per command.

Global Options:
  --output-dir, -o    Output directory (default: ~/Documents/QCut/exports)
  --model, -m         Model key (e.g. kling_2_6_pro, flux_dev)
  --policy            Path to JSON action policy file
  --resume            Resume and autosave a named CLI session
  --json              Output results as JSON
  --quiet, -q         Suppress progress output
  --force             Bypass action-policy confirmations when allowed
  --help, -h          Show help
  --version           Show version

Examples:
  ${bin} gen image -t "A cat in space"
  ${bin} gen video -m kling_2_6_pro -t "Ocean waves" -d 5s
  ${bin} flow run -c pipeline.yaml -i "A sunset"
  ${bin} analyze transcribe --video-url video.mp4
  ${bin} system models --json
  ${bin} editor:timeline:export --project-id my-proj --json
`.trim()
	);
}

/** Print help for a specific command group. */
export function printGroupHelp(groupName: string): void {
	const bin = getCliName();
	const group = COMMAND_GROUPS.find((g) => g.name === groupName);
	if (!group) {
		console.error(`Unknown group: ${groupName}`);
		process.exit(2);
	}

	const actionLines: string[] = [];
	for (const [action, internalCmd] of Object.entries(group.actions)) {
		const cmd = getCommand(internalCmd);
		const desc = cmd?.description ?? internalCmd;
		actionLines.push(`  ${action.padEnd(20)} ${desc}`);
	}

	console.log(
		`
${bin} ${group.name} — ${group.label}

${group.description}

Usage: ${bin} ${group.name} <action> [options]

Actions:
${actionLines.join("\n")}

Run "${bin} ${group.name} <action> --help" for action details.
`.trim()
	);
}

/** Level 1: Root overview — version, categories, command list. */
export function printHelpJson(): void {
	const commands = Object.values(COMMANDS_REGISTRY).map((cmd) => ({
		name: cmd.name,
		description: cmd.description,
		category: cmd.category,
	}));
	jsonOk({
		version: CLI_VERSION,
		description: "AI content generation CLI",
		categories: CATEGORIES,
		commands,
		globalFlags: GLOBAL_FLAGS,
	});
}

/** Level 2: Command detail — flags, examples, usage. */
export function printCommandHelpJson(command: string): void {
	const def = getCommand(command);
	if (!def) {
		jsonError(`Unknown command: ${command}`, "help:unknown-command");
		return;
	}
	const required = def.flags.filter((fl) => fl.required);
	const optional = def.flags.filter((fl) => !fl.required);
	jsonOk({
		command: def.name,
		description: def.description,
		category: def.category,
		usage: def.usage ?? `qcut-pipeline ${def.name} [options]`,
		required,
		optional,
		examples: def.examples,
	});
}

/** Level 3: Single parameter detail — type, enum, default. */
export function printParamHelpJson(command: string, paramName: string): void {
	const flag = getCommandFlag(command, paramName);
	if (!flag) {
		jsonError(
			`Unknown parameter '${paramName}' for command '${command}'`,
			"help:unknown-param"
		);
		return;
	}
	const data: Record<string, unknown> = {
		name: flag.name,
		type: flag.type,
		description: flag.description,
	};
	if (flag.short) data.short = flag.short;
	if (flag.required) data.required = flag.required;
	if (flag.default !== undefined) data.default = flag.default;
	if (flag.enum) data.enum = flag.enum;
	jsonOk(data);
}

/**
 * Find a bare parameter name after --help in argv.
 * e.g. ["--help", "model", "--json"] → "model"
 */
export function findHelpParam(argv: string[]): string | null {
	const helpIdx = argv.indexOf("--help");
	if (helpIdx === -1) return null;
	const next = argv[helpIdx + 1];
	if (next && !next.startsWith("-")) return next;
	return null;
}
