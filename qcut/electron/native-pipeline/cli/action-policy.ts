import * as fs from "node:fs";
import type { CLIRunOptions } from "./cli-runner/types.js";

export interface ActionPolicy {
	allow: string[];
	confirm: string[];
	deny: string[];
}

export interface ActionPolicyMatch {
	decision: "allow" | "confirm" | "deny";
	matchedPattern?: string;
}

const POLICY_SENSITIVE_OPTION_FLAGS: Array<{
	key: keyof CLIRunOptions;
	flag: string;
}> = [
	{ key: "set", flag: "--set" },
	{ key: "reveal", flag: "--reveal" },
	{ key: "clear", flag: "--clear" },
	{ key: "discard", flag: "--discard" },
	{ key: "replace", flag: "--replace" },
	{ key: "ripple", flag: "--ripple" },
	{ key: "crossTrackRipple", flag: "--cross-track-ripple" },
	{ key: "removeFillers", flag: "--remove-fillers" },
	{ key: "removeSilences", flag: "--remove-silences" },
	{ key: "addToTimeline", flag: "--add-to-timeline" },
	{ key: "interactive", flag: "--interactive" },
	{ key: "full", flag: "--full" },
];

const DEFAULT_ALLOW_PATTERNS = [
	"editor:health",
	"editor:console",
	"editor:errors",
	"editor:auth:token",
	"editor:media:list",
	"editor:media:info",
	"editor:project:settings",
	"editor:project:stats",
	"editor:project:summary",
	"editor:project:report",
	"editor:project:list",
	"editor:project:info",
	"editor:timeline:export",
	"editor:timeline:get-selection",
	"editor:timeline:info",
	"editor:analyze:*",
	"editor:transcribe:status",
	"editor:transcribe:list-jobs",
	"editor:generate:status",
	"editor:generate:list-jobs",
	"editor:generate:models",
	"editor:generate:estimate-cost",
	"editor:export:presets",
	"editor:export:recommend",
	"editor:export:status",
	"editor:export:list-jobs",
	"editor:navigator:projects",
	"editor:screen-recording:sources",
	"editor:screen-recording:status",
	"editor:remotion:list",
	"editor:remotion:inspect",
	"editor:snapshot",
	"editor:state:snapshot",
	"editor:diff:*",
	"editor:session:*",
	"editor:screenshot:capture",
	"editor:search:*",
];

const DEFAULT_CONFIRM_PATTERNS = [
	"editor:auth:activate",
	"editor:auth:logout",
	"editor:auth:token --set",
	"editor:auth:token --reveal",
	"editor:console --clear",
	"editor:errors --clear",
	"editor:media:delete",
	"editor:project:delete",
	"editor:project:import-state",
	"editor:timeline:delete-element",
	"editor:timeline:batch-delete",
	"editor:editing:batch-cuts",
	"editor:editing:delete-range",
	"editor:editing:auto-edit",
	"editor:snapshot:click",
	"editor:snapshot:fill",
	"editor:undo",
	"editor:redo",
	"editor:screen-recording:stop --discard",
	"editor:screen-recording:force-stop",
];

const DEFAULT_DENY_PATTERNS: string[] = [];

export const DEFAULT_ACTION_POLICY: ActionPolicy = {
	allow: [...DEFAULT_ALLOW_PATTERNS],
	confirm: [...DEFAULT_CONFIRM_PATTERNS],
	deny: [...DEFAULT_DENY_PATTERNS],
};

function normalizePatterns({
	value,
	field,
}: {
	value: unknown;
	field: keyof ActionPolicy;
}): string[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new Error(`Action policy field '${field}' must be an array of strings.`);
	}

	const patterns: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") {
			throw new Error(
				`Action policy field '${field}' must contain only strings.`
			);
		}
		const trimmed = entry.trim();
		if (!trimmed) {
			continue;
		}
		patterns.push(trimmed);
	}
	return patterns;
}

export function parseActionPolicy({
	value,
}: {
	value: unknown;
}): ActionPolicy {
	if (typeof value !== "object" || value === null) {
		throw new Error("Action policy must be a JSON object.");
	}

	const candidate = value as Partial<Record<keyof ActionPolicy, unknown>>;
	return {
		allow: normalizePatterns({ value: candidate.allow, field: "allow" }),
		confirm: normalizePatterns({
			value: candidate.confirm,
			field: "confirm",
		}),
		deny: normalizePatterns({ value: candidate.deny, field: "deny" }),
	};
}

function escapeRegExp({
	value,
}: {
	value: string;
}): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesActionPattern({
	command,
	pattern,
}: {
	command: string;
	pattern: string;
}): boolean {
	const normalizedPattern = pattern.trim();
	if (!normalizedPattern) {
		return false;
	}
	if (normalizedPattern === "*") {
		return true;
	}

	const regexPattern = normalizedPattern
		.split("*")
		.map((part) => escapeRegExp({ value: part }))
		.join(".*");
	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(command);
}

export function buildActionPolicySubject({
	options,
}: {
	options: CLIRunOptions;
}): string {
	const tokens = [options.command];
	for (const entry of POLICY_SENSITIVE_OPTION_FLAGS) {
		const value = options[entry.key];
		if (typeof value === "boolean") {
			if (value) {
				tokens.push(entry.flag);
			}
			continue;
		}
		if (typeof value === "string" && value.trim().length > 0) {
			tokens.push(entry.flag);
		}
	}
	return tokens.join(" ");
}

function findMatchingPattern({
	candidates,
	patterns,
}: {
	candidates: string[];
	patterns: string[];
}): string | undefined {
	for (const pattern of patterns) {
		for (const candidate of candidates) {
			if (matchesActionPattern({ command: candidate, pattern })) {
				return pattern;
			}
		}
	}
	return undefined;
}

export function evaluateActionPolicy({
	command,
	options,
	policy,
}: {
	command?: string;
	options?: CLIRunOptions;
	policy: ActionPolicy;
}): ActionPolicyMatch {
	const resolvedCommand = options?.command ?? command;
	if (!resolvedCommand) {
		throw new Error("Action policy evaluation requires a command.");
	}
	const candidates = options
		? Array.from(new Set([buildActionPolicySubject({ options }), resolvedCommand]))
		: [resolvedCommand];

	const denyPattern = findMatchingPattern({
		candidates,
		patterns: policy.deny,
	});
	if (denyPattern) {
		return { decision: "deny", matchedPattern: denyPattern };
	}

	const confirmPattern = findMatchingPattern({
		candidates,
		patterns: policy.confirm,
	});
	if (confirmPattern) {
		return { decision: "confirm", matchedPattern: confirmPattern };
	}

	const allowPattern = findMatchingPattern({
		candidates,
		patterns: policy.allow,
	});
	if (allowPattern) {
		return { decision: "allow", matchedPattern: allowPattern };
	}

	return { decision: "allow" };
}

export function loadActionPolicy({
	policyPath,
}: {
	policyPath: string;
}): ActionPolicy {
	let content: string;
	try {
		content = fs.readFileSync(policyPath, "utf-8");
	} catch (error) {
		throw new Error(
			`Cannot read action policy file '${policyPath}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(
			`Invalid JSON in action policy file '${policyPath}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	return parseActionPolicy({ value: parsed });
}

export function resolveActionPolicy({
	policyPath,
}: {
	policyPath?: string;
}): {
	policy: ActionPolicy;
	source: "default" | "file";
} {
	if (!policyPath) {
		return {
			policy: {
				allow: [...DEFAULT_ACTION_POLICY.allow],
				confirm: [...DEFAULT_ACTION_POLICY.confirm],
				deny: [...DEFAULT_ACTION_POLICY.deny],
			},
			source: "default",
		};
	}

	return {
		policy: loadActionPolicy({ policyPath }),
		source: "file",
	};
}
