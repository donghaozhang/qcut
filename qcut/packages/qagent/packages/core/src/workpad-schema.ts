/**
 * Canonical WorkpadSnapshot type and rendering helpers.
 *
 * WorkpadSnapshot is the single source of truth for workpad state across all
 * tracker plugins (GitHub, Linear, etc.). Every tracker serializes/deserializes
 * this shape, enabling uniform queries via `qagent policy check` regardless of
 * which tracker is configured.
 */

import type { SessionStatus } from "./types.js";
import type { PolicyMode } from "./types.js";

// =============================================================================
// WorkpadSnapshot — canonical workpad state
// =============================================================================

export interface WorkpadPolicyGate {
	mode: PolicyMode;
	passed: boolean;
	ciStatus: string | null;
	reviewDecision: string | null;
	violations: Array<{ code: string; message: string; blockerClass: string }>;
	failingChecks: string[];
}

export interface WorkpadBlockerBrief {
	what: string;
	whyBlocks: string;
	actionNeeded: string;
}

export interface WorkpadSnapshot {
	/** "session-id:branch@status" — canonical identity stamp */
	envStamp: string;
	sessionId: string;
	status: SessionStatus;
	branch: string | null;
	issueId: string | null;
	prNumber: number | null;
	prUrl: string | null;
	agentSummary: string | null;
	trackerState: string | null;
	policyGate: WorkpadPolicyGate | null;
	blockerBrief: WorkpadBlockerBrief | null;
	/** ISO timestamp */
	updatedAt: string;
}

// =============================================================================
// WorkpadRef — returned by tracker upsertWorkpad / getWorkpad
// =============================================================================

export interface WorkpadRef {
	id: string;
	url?: string;
	snapshot: WorkpadSnapshot;
}

// =============================================================================
// Rendering — snapshot → Markdown body
// =============================================================================

const BLOCKED_STATUS_SET = new Set<SessionStatus>([
	"ci_failed",
	"changes_requested",
	"needs_input",
	"stuck",
	"errored",
]);

function blockerBriefForStatus(status: SessionStatus): WorkpadBlockerBrief | null {
	switch (status) {
		case "ci_failed":
			return {
				what: "CI checks are failing on the PR",
				whyBlocks: "PR cannot merge with failing CI",
				actionNeeded: "Review CI output and fix failing checks",
			};
		case "changes_requested":
			return {
				what: "Reviewer has requested changes on the PR",
				whyBlocks: "Changes must be addressed before approval",
				actionNeeded: "Review PR feedback and implement requested changes",
			};
		case "needs_input":
			return {
				what: "Agent is waiting for human input",
				whyBlocks: "Agent cannot proceed without clarification",
				actionNeeded: "Attach to session and provide the required input",
			};
		case "stuck":
			return {
				what: "Agent appears unresponsive or stuck",
				whyBlocks: "No progress is being made",
				actionNeeded: "Attach to session to investigate; consider sending guidance or re-spawning",
			};
		case "errored":
			return {
				what: "Agent session encountered an error",
				whyBlocks: "Execution halted unexpectedly",
				actionNeeded: "Check session logs and re-spawn if necessary",
			};
		default:
			return null;
	}
}

/** Render a WorkpadSnapshot to a Markdown string. */
export function renderWorkpadBody(snapshot: WorkpadSnapshot): string {
	const sections: string[] = [];

	// Environment stamp — single source of truth identity
	sections.push(`# QAgent Workpad\n\n\`\`\`text\n${snapshot.envStamp}\n\`\`\``);

	// Status section
	const statusLines = [
		"### Status",
		"",
		`- **Session**: ${snapshot.sessionId}`,
		`- **Status**: \`${snapshot.status}\``,
		`- **Branch**: ${snapshot.branch ?? "n/a"}`,
		`- **Updated**: ${snapshot.updatedAt}`,
	];
	if (snapshot.issueId) {
		statusLines.push(`- **Issue**: ${snapshot.issueId}`);
	}
	if (snapshot.prNumber !== null && snapshot.prUrl) {
		statusLines.push(`- **PR**: [#${String(snapshot.prNumber)}](${snapshot.prUrl})`);
	}
	if (snapshot.agentSummary) {
		statusLines.push(`- **Summary**: ${snapshot.agentSummary.replace(/\n/g, " ")}`);
	}
	if (snapshot.trackerState) {
		statusLines.push(`- **Tracker State**: ${snapshot.trackerState}`);
	}
	sections.push(statusLines.join("\n"));

	// Policy Gate section
	if (snapshot.policyGate) {
		const gate = snapshot.policyGate;
		const passIcon = gate.passed ? "✅" : "❌";
		const gateLines = [
			"### Policy Gate",
			"",
			`- Mode: \`${gate.mode}\` ${passIcon} ${gate.passed ? "pass" : "fail"}`,
		];
		if (gate.ciStatus) {
			gateLines.push(`- CI: \`${gate.ciStatus}\``);
		}
		if (gate.reviewDecision) {
			gateLines.push(`- Review decision: \`${gate.reviewDecision}\``);
		}
		if (!gate.passed && gate.violations.length > 0) {
			gateLines.push("- **Violations**:");
			for (const v of gate.violations.slice(0, 5)) {
				gateLines.push(`  - \`${v.code}\` [${v.blockerClass}]: ${v.message}`);
			}
		}
		if (gate.failingChecks.length > 0) {
			gateLines.push(
				`- Failing required checks: ${gate.failingChecks.map((c) => `\`${c}\``).join(", ")}`
			);
		}
		sections.push(gateLines.join("\n"));
	}

	// Blocker Brief
	if (snapshot.blockerBrief) {
		const b = snapshot.blockerBrief;
		const briefLines = [
			"### Blocker Brief",
			"",
			`- **What**: ${b.what}`,
			`- **Why it blocks**: ${b.whyBlocks}`,
			`- **Action needed**: ${b.actionNeeded}`,
		];
		sections.push(briefLines.join("\n"));
	}

	// Notes
	sections.push(`### Notes\n\n- Status transitioned to \`${snapshot.status}\` at ${snapshot.updatedAt}`);

	// Hidden structured data for round-trip (parseable by getWorkpad)
	// Escape "-->" so it cannot break the HTML comment delimiter
	const json = JSON.stringify(snapshot).replace(/-->/g, "--\\>");
	sections.push(`<!-- qagent-workpad-snapshot\n${json}\n-->`);

	return sections.join("\n\n");
}

/** Extract WorkpadSnapshot from a rendered workpad body. Returns null if not found. */
export function parseWorkpadSnapshot(body: string): WorkpadSnapshot | null {
	const match = body.match(/<!-- qagent-workpad-snapshot\n([\s\S]*?)\n-->/);
	if (!match || !match[1]) {
		return null;
	}
	try {
		// Unescape "-->" that was escaped during serialization
		const raw = match[1].replace(/--\\>/g, "-->");
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			return null;
		}
		const obj = parsed as Record<string, unknown>;
		// Validate required fields before trusting the payload
		if (
			typeof obj["sessionId"] !== "string" ||
			typeof obj["status"] !== "string" ||
			typeof obj["updatedAt"] !== "string"
		) {
			return null;
		}
		return obj as unknown as WorkpadSnapshot;
	} catch {
		return null;
	}
}

/** Build a WorkpadSnapshot from raw session data. */
export function buildWorkpadSnapshot({
	sessionId,
	status,
	branch,
	issueId,
	prNumber,
	prUrl,
	agentSummary,
	trackerState,
	policyGate,
}: {
	sessionId: string;
	status: SessionStatus;
	branch: string | null;
	issueId: string | null;
	prNumber: number | null;
	prUrl: string | null;
	agentSummary: string | null;
	trackerState: string | null;
	policyGate: WorkpadPolicyGate | null;
}): WorkpadSnapshot {
	const updatedAt = new Date().toISOString();
	const envStamp = `${sessionId}:${branch ?? "no-branch"}@${status}`;
	const blockerBrief = BLOCKED_STATUS_SET.has(status) ? blockerBriefForStatus(status) : null;

	return {
		envStamp,
		sessionId,
		status,
		branch,
		issueId,
		prNumber,
		prUrl,
		agentSummary,
		trackerState,
		policyGate,
		blockerBrief,
		updatedAt,
	};
}
