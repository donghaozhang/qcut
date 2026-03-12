import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native-pipeline/cli/cli-handlers-editor.js", () => ({
	handleEditorCommand: vi.fn(async () => ({
		success: true,
		data: { routed: true },
	})),
}));

vi.mock("../native-pipeline/cli/interactive.js", () => ({
	readStdin: vi.fn(),
	isInteractive: vi.fn(() => false),
	confirm: vi.fn(async () => true),
}));

import {
	DEFAULT_ACTION_POLICY,
	evaluateActionPolicy,
	loadActionPolicy,
	matchesActionPattern,
} from "../native-pipeline/cli/action-policy.js";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import { CLIPipelineRunner } from "../native-pipeline/cli/cli-runner.js";
import { parseSessionLine } from "../native-pipeline/cli/cli-runner/session.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import * as interactive from "../native-pipeline/cli/interactive.js";

function defaultOptions(
	overrides: Partial<CLIRunOptions> = {}
): CLIRunOptions {
	return {
		command: "editor:timeline:export",
		outputDir: "./test-output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...overrides,
	};
}

function writePolicyFile({
	content,
}: {
	content: string;
}): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-action-policy-"));
	const filePath = path.join(dir, "policy.json");
	fs.writeFileSync(filePath, content, "utf-8");
	return filePath;
}

describe("action policy", () => {
	const tempDirs = new Set<string>();

	beforeEach(() => {
		vi.mocked(handleEditorCommand).mockClear();
		vi.mocked(interactive.isInteractive).mockReturnValue(false);
		vi.mocked(interactive.confirm).mockResolvedValue(true);
	});

	afterEach(() => {
		for (const dir of tempDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.clear();
	});

	it("matches exact and wildcard action patterns", () => {
		expect(
			matchesActionPattern({
				command: "editor:timeline:batch-delete",
				pattern: "editor:timeline:*",
			})
		).toBe(true);
		expect(
			matchesActionPattern({
				command: "editor:timeline:batch-delete",
				pattern: "editor:timeline:batch-delete",
			})
		).toBe(true);
		expect(
			matchesActionPattern({
				command: "editor:timeline:batch-delete",
				pattern: "editor:project:*",
			})
		).toBe(false);
	});

	it("classifies default destructive commands as confirm", () => {
		const result = evaluateActionPolicy({
			command: "editor:timeline:batch-delete",
			policy: DEFAULT_ACTION_POLICY,
		});

		expect(result.decision).toBe("confirm");
		expect(result.matchedPattern).toBe("editor:timeline:batch-delete");
	});

	it("allows default read-only commands", () => {
		const result = evaluateActionPolicy({
			command: "editor:timeline:export",
			policy: DEFAULT_ACTION_POLICY,
		});

		expect(result.decision).toBe("allow");
	});

	it("loads a custom JSON policy file", () => {
		const policyPath = writePolicyFile({
			content: JSON.stringify({
				allow: ["editor:timeline:*"],
				confirm: ["editor:snapshot:*"],
				deny: ["editor:project:delete"],
			}),
		});
		tempDirs.add(path.dirname(policyPath));

		const policy = loadActionPolicy({ policyPath });

		expect(policy.allow).toEqual(["editor:timeline:*"]);
		expect(policy.confirm).toEqual(["editor:snapshot:*"]);
		expect(policy.deny).toEqual(["editor:project:delete"]);
	});

	it("parses --policy from one-shot CLI args", () => {
		const opts = parseCliArgs([
			"editor:timeline:export",
			"--project-id",
			"proj1",
			"--policy",
			"/tmp/policy.json",
		]);

		expect(opts.policy).toBe("/tmp/policy.json");
	});

	it("carries policy and force through session parsing", () => {
		const opts = parseSessionLine(
			"editor:timeline:batch-delete --project-id proj1 --force",
			{
				outputDir: "./session-output",
				policy: "/tmp/policy.json",
				session: true,
			}
		);

		expect(opts?.policy).toBe("/tmp/policy.json");
		expect(opts?.force).toBe(true);
		expect(opts?.projectId).toBe("proj1");
	});

	it("blocks confirm-tier commands without --force in non-interactive mode", async () => {
		const runner = new CLIPipelineRunner();

		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:batch-delete",
				projectId: "proj1",
			}),
			vi.fn()
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("requires confirmation");
		expect(handleEditorCommand).not.toHaveBeenCalled();
	});

	it("allows confirm-tier commands with --force", async () => {
		const runner = new CLIPipelineRunner();

		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:batch-delete",
				projectId: "proj1",
				force: true,
			}),
			vi.fn()
		);

		expect(result.success).toBe(true);
		expect(handleEditorCommand).toHaveBeenCalledTimes(1);
	});

	it("uses a custom policy file to allow commands that default to confirm", async () => {
		const policyPath = writePolicyFile({
			content: JSON.stringify({
				allow: ["editor:timeline:batch-delete"],
				confirm: [],
				deny: [],
			}),
		});
		tempDirs.add(path.dirname(policyPath));

		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:batch-delete",
				projectId: "proj1",
				policy: policyPath,
			}),
			vi.fn()
		);

		expect(result.success).toBe(true);
		expect(handleEditorCommand).toHaveBeenCalledTimes(1);
	});

	it("blocks denied commands even with --force", async () => {
		const policyPath = writePolicyFile({
			content: JSON.stringify({
				allow: [],
				confirm: [],
				deny: ["editor:timeline:batch-delete"],
			}),
		});
		tempDirs.add(path.dirname(policyPath));

		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:batch-delete",
				projectId: "proj1",
				policy: policyPath,
				force: true,
			}),
			vi.fn()
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("blocked by action policy");
		expect(handleEditorCommand).not.toHaveBeenCalled();
	});

	it("reports invalid policy files clearly", async () => {
		const policyPath = writePolicyFile({
			content: "{ bad json",
		});
		tempDirs.add(path.dirname(policyPath));

		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:export",
				projectId: "proj1",
				policy: policyPath,
			}),
			vi.fn()
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Failed to load action policy");
	});
});
