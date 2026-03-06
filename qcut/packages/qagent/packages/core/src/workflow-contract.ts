import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { OrchestratorConfig, PolicyMode, ProjectConfig } from "./types.js";
import { parseEscalationTemplates, type EscalationTemplate } from "./escalation-template.js";

export type PolicyBlockerClass =
	| "auth_missing"
	| "permission_denied"
	| "external_dependency_unavailable"
	| "policy_gate_failed";

export const POLICY_BLOCKER_CLASS = {
	AUTH_MISSING: "auth_missing" as const,
	PERMISSION_DENIED: "permission_denied" as const,
	EXTERNAL_DEPENDENCY_UNAVAILABLE: "external_dependency_unavailable" as const,
	POLICY_GATE_FAILED: "policy_gate_failed" as const,
} satisfies Record<string, PolicyBlockerClass>;

export interface WorkflowReviewGate {
	enabled: boolean;
	requireReviewSweep: boolean;
	requireDecision: "approved" | "any";
	maxUnresolvedComments: number;
}

export interface WorkflowMergeGate {
	enabled: boolean;
	requireCiPassing: boolean;
	requireApproval: boolean;
	requireNoConflicts: boolean;
	requireMergeable: boolean;
	requiredChecks: string[];
}

export interface WorkflowBlockedPolicy {
	escalation: "notify" | "block";
	classes: PolicyBlockerClass[];
	/** Per-severity escalation templates (parsed from WORKFLOW.md front matter or qagent.yaml). */
	templates?: EscalationTemplate[];
}

export interface WorkflowPolicy {
	activeStates: string[];
	reviewGate: WorkflowReviewGate;
	mergeGate: WorkflowMergeGate;
	blockedPolicy: WorkflowBlockedPolicy;
}

export interface WorkflowContract {
	path: string;
	policyMode?: PolicyMode;
	policy: WorkflowPolicy;
	promptTemplate: string | null;
	rawFrontMatter: Record<string, unknown>;
}

export interface WorkflowContractPathResult {
	path: string | null;
	candidates: string[];
}

export interface EffectiveWorkflowPolicy {
	mode: PolicyMode;
	policy: WorkflowPolicy;
	contractPath?: string;
	promptTemplate: string | null;
}

const DEFAULT_POLICY_MODE: PolicyMode = "advisory";

export const DEFAULT_WORKFLOW_POLICY: WorkflowPolicy = {
	activeStates: [],
	reviewGate: {
		enabled: true,
		requireReviewSweep: true,
		requireDecision: "approved",
		maxUnresolvedComments: 0,
	},
	mergeGate: {
		enabled: true,
		requireCiPassing: true,
		requireApproval: true,
		requireNoConflicts: true,
		requireMergeable: true,
		requiredChecks: [],
	},
	blockedPolicy: {
		escalation: "notify",
		classes: [
			POLICY_BLOCKER_CLASS.AUTH_MISSING,
			POLICY_BLOCKER_CLASS.PERMISSION_DENIED,
			POLICY_BLOCKER_CLASS.EXTERNAL_DEPENDENCY_UNAVAILABLE,
			POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
		],
	},
};

function clonePolicy({ policy }: { policy: WorkflowPolicy }): WorkflowPolicy {
	return {
		activeStates: [...policy.activeStates],
		reviewGate: { ...policy.reviewGate },
		mergeGate: {
			...policy.mergeGate,
			requiredChecks: [...policy.mergeGate.requiredChecks],
		},
		blockedPolicy: {
			...policy.blockedPolicy,
			classes: [...policy.blockedPolicy.classes],
			templates: policy.blockedPolicy.templates
				? [...policy.blockedPolicy.templates]
				: undefined,
		},
	};
}

function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

function pickFirst({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: string[];
}): unknown {
	for (const key of keys) {
		if (key in record) {
			return record[key];
		}
	}
	return undefined;
}

function normalizeStringList({
	value,
}: {
	value: unknown;
}): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((entry): entry is string => typeof entry === "string")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return [];
}

function normalizeBoolean({
	value,
	fallback,
}: {
	value: unknown;
	fallback: boolean;
}): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	return fallback;
}

function normalizeNumber({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return value;
	}
	return fallback;
}

function normalizePolicyBlockerClasses({
	value,
	fallback,
}: {
	value: unknown;
	fallback: PolicyBlockerClass[];
}): PolicyBlockerClass[] {
	const normalized = normalizeStringList({ value });
	const allowed = new Set<PolicyBlockerClass>([
		POLICY_BLOCKER_CLASS.AUTH_MISSING,
		POLICY_BLOCKER_CLASS.PERMISSION_DENIED,
		POLICY_BLOCKER_CLASS.EXTERNAL_DEPENDENCY_UNAVAILABLE,
		POLICY_BLOCKER_CLASS.POLICY_GATE_FAILED,
	]);
	const classes = normalized.filter((entry): entry is PolicyBlockerClass =>
		allowed.has(entry as PolicyBlockerClass)
	);
	if (classes.length === 0) {
		return [...fallback];
	}
	return classes;
}

function normalizePolicyMode({
	value,
}: {
	value: unknown;
}): PolicyMode | undefined {
	if (value === "advisory" || value === "enforced") {
		return value;
	}
	return undefined;
}

function splitFrontMatter({
	content,
}: {
	content: string;
}): { frontMatter: Record<string, unknown>; body: string } {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---\n")) {
		return { frontMatter: {}, body: normalized.trim() };
	}

	const lines = normalized.split("\n");
	let closingIndex = -1;
	for (let index = 1; index < lines.length; index++) {
		if (lines[index]?.trim() === "---") {
			closingIndex = index;
			break;
		}
	}

	if (closingIndex === -1) {
		throw new Error("Invalid workflow contract front matter: missing closing '---'");
	}

	const frontMatterSource = lines.slice(1, closingIndex).join("\n");
	const parsed = parseYaml(frontMatterSource);
	if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
		throw new Error("Workflow contract front matter must be a YAML object");
	}

	return {
		frontMatter: toRecord({ value: parsed }),
		body: lines.slice(closingIndex + 1).join("\n").trim(),
	};
}

function resolvePathFromProject({
	project,
	relativeOrAbsolutePath,
}: {
	project: ProjectConfig;
	relativeOrAbsolutePath: string;
}): string {
	if (isAbsolute(relativeOrAbsolutePath)) {
		return relativeOrAbsolutePath;
	}
	return resolve(project.path, relativeOrAbsolutePath);
}

function parseWorkflowPolicy({
	frontMatter,
}: {
	frontMatter: Record<string, unknown>;
}): WorkflowPolicy {
	const defaults = clonePolicy({ policy: DEFAULT_WORKFLOW_POLICY });

	const policyRecord = toRecord({
		value: pickFirst({ record: frontMatter, keys: ["policy"] }),
	});

	const reviewRecord = toRecord({
		value:
			pickFirst({ record: policyRecord, keys: ["review_gate", "reviewGate"] }) ??
			pickFirst({ record: frontMatter, keys: ["review_gate", "reviewGate"] }),
	});

	const mergeRecord = toRecord({
		value:
			pickFirst({ record: policyRecord, keys: ["merge_gate", "mergeGate"] }) ??
			pickFirst({ record: frontMatter, keys: ["merge_gate", "mergeGate"] }),
	});

	const blockedRecord = toRecord({
		value:
			pickFirst({
				record: policyRecord,
				keys: ["blocked_policy", "blockedPolicy"],
			}) ??
			pickFirst({
				record: frontMatter,
				keys: ["blocked_policy", "blockedPolicy"],
			}),
	});

	defaults.activeStates = normalizeStringList({
		value:
			pickFirst({ record: policyRecord, keys: ["active_states", "activeStates"] }) ??
			pickFirst({ record: frontMatter, keys: ["active_states", "activeStates"] }),
	});

	defaults.reviewGate.enabled = normalizeBoolean({
		value: pickFirst({ record: reviewRecord, keys: ["enabled"] }),
		fallback: defaults.reviewGate.enabled,
	});
	defaults.reviewGate.requireReviewSweep = normalizeBoolean({
		value: pickFirst({
			record: reviewRecord,
			keys: ["require_review_sweep", "requireReviewSweep"],
		}),
		fallback: defaults.reviewGate.requireReviewSweep,
	});
	defaults.reviewGate.maxUnresolvedComments = normalizeNumber({
		value: pickFirst({
			record: reviewRecord,
			keys: ["max_unresolved_comments", "maxUnresolvedComments"],
		}),
		fallback: defaults.reviewGate.maxUnresolvedComments,
	});
	const requireDecision = pickFirst({
		record: reviewRecord,
		keys: ["require_decision", "requireDecision"],
	});
	if (requireDecision === "approved" || requireDecision === "any") {
		defaults.reviewGate.requireDecision = requireDecision;
	}

	defaults.mergeGate.enabled = normalizeBoolean({
		value: pickFirst({ record: mergeRecord, keys: ["enabled"] }),
		fallback: defaults.mergeGate.enabled,
	});
	defaults.mergeGate.requireCiPassing = normalizeBoolean({
		value: pickFirst({
			record: mergeRecord,
			keys: ["require_ci_passing", "requireCiPassing"],
		}),
		fallback: defaults.mergeGate.requireCiPassing,
	});
	defaults.mergeGate.requireApproval = normalizeBoolean({
		value: pickFirst({
			record: mergeRecord,
			keys: ["require_approval", "requireApproval"],
		}),
		fallback: defaults.mergeGate.requireApproval,
	});
	defaults.mergeGate.requireNoConflicts = normalizeBoolean({
		value: pickFirst({
			record: mergeRecord,
			keys: ["require_no_conflicts", "requireNoConflicts"],
		}),
		fallback: defaults.mergeGate.requireNoConflicts,
	});
	defaults.mergeGate.requireMergeable = normalizeBoolean({
		value: pickFirst({
			record: mergeRecord,
			keys: ["require_mergeable", "requireMergeable"],
		}),
		fallback: defaults.mergeGate.requireMergeable,
	});
	defaults.mergeGate.requiredChecks = normalizeStringList({
		value: pickFirst({
			record: mergeRecord,
			keys: ["required_checks", "requiredChecks"],
		}),
	});

	const escalation = pickFirst({
		record: blockedRecord,
		keys: ["escalation"],
	});
	if (escalation === "notify" || escalation === "block") {
		defaults.blockedPolicy.escalation = escalation;
	}
	defaults.blockedPolicy.classes = normalizePolicyBlockerClasses({
		value: pickFirst({ record: blockedRecord, keys: ["classes"] }),
		fallback: defaults.blockedPolicy.classes,
	});

	const rawTemplates = pickFirst({
		record: blockedRecord,
		keys: ["templates"],
	});
	if (rawTemplates !== undefined) {
		const parsed = parseEscalationTemplates({ raw: rawTemplates });
		if (parsed.length > 0) {
			defaults.blockedPolicy.templates = parsed;
		}
	}

	return defaults;
}

export function resolveWorkflowContractPath({
	config,
	project,
}: {
	config: Pick<OrchestratorConfig, "workflowContractPath" | "policyMode">;
	project: ProjectConfig;
}): WorkflowContractPathResult {
	try {
		const candidates: string[] = [];

		if (project.workflowContractPath) {
			candidates.push(
				resolvePathFromProject({
					project,
					relativeOrAbsolutePath: project.workflowContractPath,
				})
			);
		}
		if (config.workflowContractPath) {
			candidates.push(
				resolvePathFromProject({
					project,
					relativeOrAbsolutePath: config.workflowContractPath,
				})
			);
		}

		candidates.push(join(project.path, ".qagent", "WORKFLOW.md"));
		candidates.push(join(project.path, "qagent.workflow.md"));

		const dedupedCandidates = Array.from(new Set(candidates));
		const found = dedupedCandidates.find((candidate) => existsSync(candidate));
		return {
			path: found ?? null,
			candidates: dedupedCandidates,
		};
	} catch (error) {
		throw new Error(
			`Failed to resolve workflow contract path for project '${project.name ?? project.repo}': ${error}`,
			{ cause: error }
		);
	}
}

export function parseWorkflowContract({
	path,
	content,
}: {
	path: string;
	content: string;
}): WorkflowContract {
	try {
		const { frontMatter, body } = splitFrontMatter({ content });
		const policyMode = normalizePolicyMode({
			value: pickFirst({
				record: frontMatter,
				keys: ["policy_mode", "policyMode"],
			}),
		});
		const policy = parseWorkflowPolicy({ frontMatter });

		return {
			path,
			policyMode,
			policy,
			promptTemplate: body.length > 0 ? body : null,
			rawFrontMatter: frontMatter,
		};
	} catch (error) {
		throw new Error(`Invalid workflow contract at '${path}': ${error}`, {
			cause: error,
		});
	}
}

export function loadWorkflowContract({
	config,
	project,
}: {
	config: Pick<OrchestratorConfig, "workflowContractPath" | "policyMode">;
	project: ProjectConfig;
}): WorkflowContract | null {
	try {
		const { path } = resolveWorkflowContractPath({ config, project });
		if (!path) {
			return null;
		}
		const content = readFileSync(path, "utf-8");
		return parseWorkflowContract({ path, content });
	} catch (error) {
		throw new Error(
			`Failed to load workflow contract for project '${project.name ?? project.repo}': ${error}`,
			{ cause: error }
		);
	}
}

export function resolveEffectiveWorkflowPolicy({
	config,
	project,
	contract,
}: {
	config: Pick<OrchestratorConfig, "policyMode">;
	project: Pick<ProjectConfig, "policyMode">;
	contract: WorkflowContract | null;
}): EffectiveWorkflowPolicy {
	try {
		const mode =
			project.policyMode ??
			contract?.policyMode ??
			config.policyMode ??
			DEFAULT_POLICY_MODE;
		const policy = contract
			? clonePolicy({ policy: contract.policy })
			: clonePolicy({ policy: DEFAULT_WORKFLOW_POLICY });

		return {
			mode,
			policy,
			contractPath: contract?.path,
			promptTemplate: contract?.promptTemplate ?? null,
		};
	} catch (error) {
		throw new Error(`Failed to resolve effective workflow policy: ${error}`, {
			cause: error,
		});
	}
}
