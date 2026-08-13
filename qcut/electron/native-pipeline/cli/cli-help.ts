import {
	COMMANDS_REGISTRY,
	CATEGORIES,
	GLOBAL_FLAGS,
	getCommand,
	getCommandFlag,
} from "./command-registry.js";
import { COMMAND_GROUPS } from "./command-groups.js";
import type { FlagDef } from "./command-registry-types.js";
import { jsonError, jsonOk } from "./json-output.js";

export const CLI_VERSION = "1.0.0";

/** Detect CLI binary name from process.argv. */
export function getCliName(): string {
	const scriptPath = process.argv[1] ?? "";
	if (
		scriptPath.endsWith("/qcut") ||
		scriptPath.endsWith("\\qcut") ||
		scriptPath.endsWith("\\qcut.exe") ||
		scriptPath.endsWith("\\qcut.cmd")
	) {
		return "qcut";
	}
	return "qcut-pipeline";
}

/** Handle print help — shows group-based taxonomy as primary. */
export function printHelp(): void {
	const bin = getCliName();
	// Build group listing
	const groupLines = COMMAND_GROUPS.map(
		(g) => `  ${g.name.padEnd(12)} ${g.description}`
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
  editor:sticker:*, editor:transition-lab:*, editor:moyin:*, editor:novel:*,
  editor:auth:*, editor:diagnostics:*, editor:mcp:forward-html,
  editor:ui:switch-panel, editor:ui:context-menu,
  editor:navigator:*,
  editor:pointer:move, editor:pointer:hover, editor:pointer:click,
  editor:pointer:double-click, editor:pointer:right-click,
  editor:pointer:drag, editor:pointer:scroll, editor:pointer:hide

Local Jianying Reference (read-only; does not require running QCut):
  editor:jianying-transition:*
  editor:jianying-import:inspect, editor:jianying-import:plan,
  editor:jianying-import:verify-roundtrip, editor:jianying-import:commit

  Use <command> --help --json for detailed flag info per command.

Global Options:
  --output-dir, -o    Output directory (default: $QCUT_OUTPUT_DIR or ~/Documents/QCut/exports)
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

/** Print group-level help as JSON. */
export function printGroupHelpJson(groupName: string): void {
	const group = COMMAND_GROUPS.find((g) => g.name === groupName);
	if (!group) {
		jsonError(`Unknown group: ${groupName}`, "help:unknown-group");
		return;
	}
	const actions = Object.entries(group.actions).map(([action, internalCmd]) => {
		const cmd = getCommand(internalCmd);
		return {
			action,
			command: internalCmd,
			description: cmd?.description ?? internalCmd,
		};
	});
	jsonOk({
		group: group.name,
		label: group.label,
		description: group.description,
		actions,
	});
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
function flagLine({ flag }: { flag: FlagDef }): string {
	// Registry entries already carry their own dashes ("--index", short "-o").
	const names = flag.short ? `${flag.short}, ${flag.name}` : flag.name;
	const detail: string[] = [];
	if (flag.type && flag.type !== "boolean") detail.push(`<${flag.type}>`);
	if (flag.enum) detail.push(`(${flag.enum.join(" | ")})`);
	if (flag.default !== undefined) detail.push(`[default: ${flag.default}]`);
	const suffix = detail.length > 0 ? ` ${detail.join(" ")}` : "";
	return `  ${names.padEnd(24)} ${flag.description}${suffix}`.trimEnd();
}

/**
 * Level 2 in plain text. Without this, `<group> <action> --help` fell through to
 * the root overview, so the only way to discover a command's flags was to run it
 * and read the error, or to ask again with --json.
 */
export function printCommandHelp(command: string): void {
	const bin = getCliName();
	const def = getCommand(command);
	if (!def) {
		console.error(`Unknown command: ${command}`);
		process.exit(2);
	}

	const required = def.flags.filter((fl) => fl.required);
	const optional = def.flags.filter((fl) => !fl.required);
	const sections = [
		`${bin} ${def.name} — ${def.description}`,
		"",
		`Usage: ${def.usage ?? `${bin} ${def.name} [options]`}`,
	];
	if (required.length > 0) {
		sections.push(
			"",
			"Required:",
			required.map((flag) => flagLine({ flag })).join("\n")
		);
	}
	if (optional.length > 0) {
		sections.push(
			"",
			"Options:",
			optional.map((flag) => flagLine({ flag })).join("\n")
		);
	}
	if (def.examples && def.examples.length > 0) {
		sections.push(
			"",
			"Examples:",
			def.examples.map((e) => `  ${e}`).join("\n")
		);
	}
	console.log(sections.join("\n"));
}

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
