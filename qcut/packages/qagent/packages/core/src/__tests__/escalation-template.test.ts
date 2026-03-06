import { describe, expect, it } from "vitest";
import {
	resolveEscalationTemplate,
	renderEscalationMessage,
	parseEscalationTemplates,
	type EscalationTemplate,
	type EscalationContext,
} from "../escalation-template.js";

// ── fixtures ──────────────────────────────────────────────────────────

const templateWarning: EscalationTemplate = {
	id: "ci-warning",
	severity: "warning",
	blockerClasses: ["policy_gate_failed"],
	messageTemplate:
		"CI is failing for {{sessionId}} on project {{projectId}}: {{violation}}",
	notifyChannels: ["slack"],
	autoAction: "none",
};

const templateUrgent: EscalationTemplate = {
	id: "auth-urgent",
	severity: "urgent",
	blockerClasses: ["auth_missing"],
	messageTemplate: "Auth missing for {{sessionId}} ({{violationCode}})",
};

const catchAllTemplate: EscalationTemplate = {
	id: "catch-all",
	severity: "warning",
	messageTemplate: "Escalation for {{sessionId}}: {{violationCode}}",
};

// ── resolveEscalationTemplate ─────────────────────────────────────────

describe("resolveEscalationTemplate", () => {
	it("returns null when no templates", () => {
		expect(
			resolveEscalationTemplate({ violations: [], templates: [] })
		).toBeNull();
	});

	it("returns null when no violations match any template blockerClass", () => {
		const result = resolveEscalationTemplate({
			violations: [
				{
					code: "CI_FAILING",
					message: "CI is failing",
					blockerClass: "permission_denied",
				},
			],
			templates: [templateWarning], // only matches policy_gate_failed
		});
		// no specific match, no catch-all → null
		expect(result).toBeNull();
	});

	it("matches template by blockerClass", () => {
		const result = resolveEscalationTemplate({
			violations: [
				{
					code: "CI_FAILING",
					message: "CI is failing",
					blockerClass: "policy_gate_failed",
				},
			],
			templates: [templateWarning, catchAllTemplate],
		});
		expect(result?.id).toBe("ci-warning");
	});

	it("falls back to catch-all when no specific match", () => {
		const result = resolveEscalationTemplate({
			violations: [
				{
					code: "SOME_CODE",
					message: "Something happened",
					blockerClass: "permission_denied",
				},
			],
			templates: [templateWarning, catchAllTemplate],
		});
		expect(result?.id).toBe("catch-all");
	});

	it("specific match beats catch-all even if catch-all comes first", () => {
		const result = resolveEscalationTemplate({
			violations: [
				{
					code: "AUTH_ERR",
					message: "Auth is missing",
					blockerClass: "auth_missing",
				},
			],
			templates: [catchAllTemplate, templateUrgent],
		});
		expect(result?.id).toBe("auth-urgent");
	});

	it("matches on any violation's blockerClass (not just first)", () => {
		const result = resolveEscalationTemplate({
			violations: [
				{ code: "V1", message: "v1", blockerClass: "permission_denied" },
				{ code: "V2", message: "v2", blockerClass: "auth_missing" },
			],
			templates: [templateUrgent],
		});
		expect(result?.id).toBe("auth-urgent");
	});

	it("returns null when violations have no blockerClass and no catch-all", () => {
		const result = resolveEscalationTemplate({
			violations: [{ code: "V1", message: "v1" }],
			templates: [templateWarning], // requires blockerClass match
		});
		expect(result).toBeNull();
	});
});

// ── renderEscalationMessage ───────────────────────────────────────────

describe("renderEscalationMessage", () => {
	const ctx: EscalationContext = {
		sessionId: "my-session-1",
		projectId: "my-app",
		prNumber: 42,
		violationCode: "CI_FAILING",
		violationMessage: "CI checks are failing",
		blockerClass: "policy_gate_failed",
	};

	it("substitutes known tokens", () => {
		const result = renderEscalationMessage({
			template: {
				id: "t1",
				severity: "warning",
				messageTemplate:
					"Session {{sessionId}} in {{projectId}} has PR #{{prNumber}}",
			},
			context: ctx,
		});
		expect(result).toBe("Session my-session-1 in my-app has PR #42");
	});

	it("substitutes violation shorthand token", () => {
		const result = renderEscalationMessage({
			template: {
				id: "t2",
				severity: "warning",
				messageTemplate: "Violation: {{violation}}",
			},
			context: ctx,
		});
		expect(result).toBe("Violation: CI_FAILING: CI checks are failing");
	});

	it("leaves unknown tokens as-is", () => {
		const result = renderEscalationMessage({
			template: {
				id: "t3",
				severity: "warning",
				messageTemplate: "Hello {{futureToken}} and {{sessionId}}",
			},
			context: ctx,
		});
		expect(result).toBe("Hello {{futureToken}} and my-session-1");
	});

	it("handles missing optional context fields gracefully", () => {
		const result = renderEscalationMessage({
			template: {
				id: "t4",
				severity: "warning",
				messageTemplate: "{{sessionId}} PR=#{{prNumber}} code={{violationCode}}",
			},
			context: { sessionId: "s1", projectId: "p1" },
		});
		expect(result).toBe("s1 PR=# code=");
	});
});

// ── parseEscalationTemplates ──────────────────────────────────────────

describe("parseEscalationTemplates", () => {
	it("returns empty array for non-array input", () => {
		expect(parseEscalationTemplates({ raw: null })).toEqual([]);
		expect(parseEscalationTemplates({ raw: "string" })).toEqual([]);
		expect(parseEscalationTemplates({ raw: {} })).toEqual([]);
	});

	it("parses valid template array from WORKFLOW.md front matter", () => {
		const raw = [
			{
				id: "ci-warn",
				severity: "warning",
				blockerClasses: ["policy_gate_failed"],
				messageTemplate: "CI failed: {{sessionId}}",
				notifyChannels: ["slack"],
				autoAction: "none",
			},
		];
		const result = parseEscalationTemplates({ raw });
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("ci-warn");
		expect(result[0]?.severity).toBe("warning");
		expect(result[0]?.blockerClasses).toEqual(["policy_gate_failed"]);
		expect(result[0]?.notifyChannels).toEqual(["slack"]);
	});

	it("skips entries missing id", () => {
		const raw = [
			{ messageTemplate: "no id here" },
			{ id: "valid", messageTemplate: "has id" },
		];
		const result = parseEscalationTemplates({ raw });
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("valid");
	});

	it("skips entries missing messageTemplate", () => {
		const raw = [{ id: "no-template" }, { id: "has-template", messageTemplate: "hello" }];
		const result = parseEscalationTemplates({ raw });
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("has-template");
	});

	it("defaults unknown severity to 'warning'", () => {
		const raw = [{ id: "t", severity: "invalid", messageTemplate: "msg" }];
		const result = parseEscalationTemplates({ raw });
		expect(result[0]?.severity).toBe("warning");
	});

	it("round-trips from WORKFLOW.md-style object", () => {
		const raw = [
			{
				id: "rt",
				severity: "urgent",
				blockerClasses: ["auth_missing", "permission_denied"],
				messageTemplate: "{{sessionId}} needs auth",
				autoAction: "resend_prompt",
			},
		];
		const result = parseEscalationTemplates({ raw });
		expect(result[0]).toMatchObject({
			id: "rt",
			severity: "urgent",
			blockerClasses: ["auth_missing", "permission_denied"],
			messageTemplate: "{{sessionId}} needs auth",
			autoAction: "resend_prompt",
		});
	});
});
