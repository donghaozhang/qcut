/**
 * Escalation template engine for per-project/per-severity notification playbooks.
 *
 * Templates are defined in qagent.yaml (`escalationTemplates`) or in WORKFLOW.md
 * front matter (`blocked_policy.templates`). When a policy gate fires or a reaction
 * escalates, `resolveEscalationTemplate` picks the most specific matching template
 * so each team can define their own notify/escalate/action playbook.
 */

import type { PolicyBlockerClass } from "./workflow-contract.js";

// =============================================================================
// Types
// =============================================================================

/** Severity maps to EventPriority — warning | action | urgent */
export type EscalationSeverity = "warning" | "action" | "urgent";

/** Automated action the system may take alongside or instead of notifying. */
export type EscalationAutoAction = "resend_prompt" | "kill" | "none";

/**
 * A single escalation template defining what to send, who to notify, and
 * what automated action (if any) to take when a matching violation occurs.
 */
export interface EscalationTemplate {
	/** Unique identifier for this template (used in dry-run output and logs). */
	id: string;

	/** Priority of the escalation notification. */
	severity: EscalationSeverity;

	/**
	 * If provided, only match violations whose `blockerClass` is in this list.
	 * Omit (or set to empty array) to match any violation.
	 */
	blockerClasses?: PolicyBlockerClass[];

	/**
	 * Handlebars-lite message template.
	 * Supported tokens: {{sessionId}}, {{projectId}}, {{violation}},
	 * {{violationCode}}, {{violationMessage}}, {{blockerClass}}, {{prNumber}}.
	 * Unknown tokens are left as-is.
	 */
	messageTemplate: string;

	/**
	 * Notifier plugin names to route this escalation to.
	 * If omitted, falls back to the default notifiers for the severity level.
	 */
	notifyChannels?: string[];

	/**
	 * Automated action to take after dispatching the notification.
	 * Defaults to "none".
	 */
	autoAction?: EscalationAutoAction;
}

/** Context variables available for template rendering. */
export interface EscalationContext {
	sessionId: string;
	projectId: string;
	prNumber?: number;
	violationCode?: string;
	violationMessage?: string;
	blockerClass?: string;
}

// =============================================================================
// resolveEscalationTemplate
// =============================================================================

/**
 * Find the most specific matching template for a set of violations.
 *
 * Matching priority:
 * 1. Templates with a matching `blockerClass` for any violation (most specific)
 * 2. Templates with no `blockerClasses` filter (catch-all)
 *
 * Among matching templates, the first one wins (order in config is significant).
 */
export function resolveEscalationTemplate({
	violations,
	templates,
}: {
	violations: Array<{ code: string; message: string; blockerClass?: string }>;
	templates: EscalationTemplate[];
}): EscalationTemplate | null {
	if (!templates || templates.length === 0) {
		return null;
	}

	const violationBlockerClasses = new Set(
		violations
			.map((v) => v.blockerClass)
			.filter((bc): bc is string => Boolean(bc))
	);

	// Pass 1: specific match — template has blockerClasses that overlap with violations
	for (const template of templates) {
		if (
			template.blockerClasses &&
			template.blockerClasses.length > 0 &&
			template.blockerClasses.some((bc) => violationBlockerClasses.has(bc))
		) {
			return template;
		}
	}

	// Pass 2: catch-all — template has no blockerClasses filter
	for (const template of templates) {
		if (!template.blockerClasses || template.blockerClasses.length === 0) {
			return template;
		}
	}

	return null;
}

// =============================================================================
// renderEscalationMessage
// =============================================================================

/**
 * Render a template message string by substituting `{{key}}` tokens.
 *
 * Unknown tokens are left as-is (e.g. `{{unknown}}` stays `{{unknown}}`).
 * This avoids silent data loss when templates reference future context vars.
 */
export function renderEscalationMessage({
	template,
	context,
}: {
	template: EscalationTemplate;
	context: EscalationContext;
}): string {
	const vars: Record<string, string> = {
		sessionId: context.sessionId,
		projectId: context.projectId,
		prNumber: context.prNumber !== undefined ? String(context.prNumber) : "",
		violationCode: context.violationCode ?? "",
		violationMessage: context.violationMessage ?? "",
		blockerClass: context.blockerClass ?? "",
		// Convenience alias: {{violation}} = "CODE: message"
		violation:
			context.violationCode && context.violationMessage
				? `${context.violationCode}: ${context.violationMessage}`
				: (context.violationCode ?? context.violationMessage ?? ""),
	};

	return template.messageTemplate.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
		return key in vars ? (vars[key] ?? _match) : _match;
	});
}

// =============================================================================
// parseEscalationTemplates — extract from raw front matter
// =============================================================================

/**
 * Parse escalation templates from a raw front matter object.
 * Tolerates missing/malformed entries — skips invalid ones with a console warning.
 */
export function parseEscalationTemplates({
	raw,
}: {
	raw: unknown;
}): EscalationTemplate[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const templates: EscalationTemplate[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			continue;
		}
		const obj = entry as Record<string, unknown>;

		if (typeof obj["id"] !== "string" || !obj["id"]) {
			console.warn("[escalation-template] skipping entry: missing 'id'");
			continue;
		}
		if (typeof obj["messageTemplate"] !== "string" || !obj["messageTemplate"]) {
			console.warn(
				`[escalation-template] skipping '${obj["id"]}': missing 'messageTemplate'`
			);
			continue;
		}

		const severity = obj["severity"];
		const normalizedSeverity: EscalationSeverity =
			severity === "warning" || severity === "action" || severity === "urgent"
				? severity
				: "warning";

		const blockerClasses: PolicyBlockerClass[] = [];
		if (Array.isArray(obj["blockerClasses"])) {
			for (const bc of obj["blockerClasses"]) {
				if (typeof bc === "string") {
					blockerClasses.push(bc as PolicyBlockerClass);
				}
			}
		}

		const notifyChannels: string[] = [];
		if (Array.isArray(obj["notifyChannels"])) {
			for (const ch of obj["notifyChannels"]) {
				if (typeof ch === "string") {
					notifyChannels.push(ch);
				}
			}
		}

		const autoAction = obj["autoAction"];
		const normalizedAutoAction: EscalationAutoAction =
			autoAction === "resend_prompt" || autoAction === "kill"
				? autoAction
				: "none";

		templates.push({
			id: obj["id"],
			severity: normalizedSeverity,
			messageTemplate: obj["messageTemplate"],
			...(blockerClasses.length > 0 && { blockerClasses }),
			...(notifyChannels.length > 0 && { notifyChannels }),
			autoAction: normalizedAutoAction,
		});
	}

	return templates;
}
