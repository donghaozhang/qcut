import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
	loadWorkflowContract,
	resolveEffectiveWorkflowPolicy,
	resolveWorkflowContractPath,
	parseWorkflowContract,
	DEFAULT_WORKFLOW_POLICY,
} from "../workflow-contract.js";
import type { OrchestratorConfig, ProjectConfig } from "../types.js";

let tmpDir: string;
let projectPath: string;
let project: ProjectConfig;
let config: Pick<OrchestratorConfig, "workflowContractPath" | "policyMode">;

beforeEach(() => {
	tmpDir = join(tmpdir(), `ao-workflow-contract-${randomUUID()}`);
	projectPath = join(tmpDir, "repo");
	mkdirSync(projectPath, { recursive: true });

	project = {
		name: "Test Project",
		repo: "acme/test",
		path: projectPath,
		defaultBranch: "main",
		sessionPrefix: "tst",
	};

	config = {};
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("workflow-contract", () => {
	it("returns null when no contract file exists", () => {
		const contract = loadWorkflowContract({ config, project });
		expect(contract).toBeNull();
	});

	it("resolves default .qagent/WORKFLOW.md path", () => {
		const workflowDir = join(projectPath, ".qagent");
		mkdirSync(workflowDir, { recursive: true });
		writeFileSync(
			join(workflowDir, "WORKFLOW.md"),
			"---\npolicy_mode: enforced\n---\nUse this workflow.\n"
		);

		const result = resolveWorkflowContractPath({ config, project });
		expect(result.path).toBe(join(workflowDir, "WORKFLOW.md"));
	});

	it("parses front matter and prompt body", () => {
		const parsed = parseWorkflowContract({
			path: "/tmp/WORKFLOW.md",
			content:
				"---\npolicy_mode: enforced\nreview_gate:\n  require_review_sweep: true\nmerge_gate:\n  required_checks: lint, test\n---\n# Team Workflow\nAlways update the workpad.\n",
		});

		expect(parsed.policyMode).toBe("enforced");
		expect(parsed.policy.reviewGate.requireReviewSweep).toBe(true);
		expect(parsed.policy.mergeGate.requiredChecks).toEqual(["lint", "test"]);
		expect(parsed.promptTemplate).toContain("# Team Workflow");
	});

	it("loads contract and resolves effective policy mode precedence", () => {
		const workflowPath = join(projectPath, "qagent.workflow.md");
		writeFileSync(
			workflowPath,
			"---\npolicy_mode: enforced\nmerge_gate:\n  require_ci_passing: false\n---\nPolicy prompt body"
		);

		const contract = loadWorkflowContract({
			config: { policyMode: "advisory" },
			project: { ...project, policyMode: "advisory" },
		});
		expect(contract).not.toBeNull();

		const effective = resolveEffectiveWorkflowPolicy({
			config: { policyMode: "advisory" },
			project: { ...project, policyMode: "enforced" },
			contract,
		});

		expect(effective.mode).toBe("enforced");
		expect(effective.policy.mergeGate.requireCiPassing).toBe(false);
		expect(effective.promptTemplate).toBe("Policy prompt body");
	});

	it("uses defaults when contract is missing", () => {
		const effective = resolveEffectiveWorkflowPolicy({
			config: {},
			project,
			contract: null,
		});
		expect(effective.mode).toBe("advisory");
		expect(effective.policy).toEqual(DEFAULT_WORKFLOW_POLICY);
	});
});
