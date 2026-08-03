import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { getCommand } from "../native-pipeline/cli/command-registry.js";
import {
	assertReferenceSkillIsSourceOnly,
	executeJianyingTransitionReference,
	type RunReferenceProcess,
} from "../native-pipeline/editor/editor-handlers-jianying-transition.js";
import { makeOpts } from "./editor-cli-test-setup";

describe("Jianying transition reference CLI", () => {
	let skillDirectory = "";
	let scriptPath = "";

	beforeEach(() => {
		skillDirectory = mkdtempSync(
			path.join(os.tmpdir(), "qcut-jianying-transition-")
		);
		const scriptsDirectory = path.join(skillDirectory, "scripts");
		mkdirSync(scriptsDirectory);
		scriptPath = path.join(scriptsDirectory, "inspect-transition.ts");
		writeFileSync(scriptPath, "console.log('{}');\n", "utf8");
	});

	afterEach(() => {
		rmSync(skillDirectory, { recursive: true, force: true });
	});

	it("parses repeatable local evidence paths", () => {
		const options = parseCliArgs([
			"editor",
			"jianying-transition",
			"inspect",
			"--title",
			"叠化",
			"--cache-root",
			"/local/cache",
			"--database",
			"/local/one.db",
			"--database",
			"/local/two.db",
			"--draft",
			"/local/draft.json",
		]);

		expect(options).toMatchObject({
			command: "editor:jianying-transition:inspect",
			title: "叠化",
			cacheRoot: "/local/cache",
			databasePaths: ["/local/one.db", "/local/two.db"],
			draftPaths: ["/local/draft.json"],
		});
	});

	it("registers every read-only research action", () => {
		for (const action of [
			"categories",
			"inventory",
			"inspect",
			"scan-drafts",
			"classify-package",
			"parity-report",
		]) {
			expect(getCommand(`editor:jianying-transition:${action}`)).toBeDefined();
		}
	});

	it("passes only allowlisted arguments and labels output as metadata-only", async () => {
		const runProcess = vi.fn<RunReferenceProcess>(async ({ args }) => ({
			exitCode: 0,
			stdout: JSON.stringify({ title: "叠化", uniqueResourceIds: 1 }),
			stderr: "",
		}));
		const result = await executeJianyingTransitionReference({
			options: makeOpts({
				command: "editor:jianying-transition:inspect",
				title: "叠化",
				cacheRoot: "/local/cache",
				databasePaths: ["/local/cache/one.db"],
				token: "must-not-reach-child",
			}),
			scriptPath,
			runProcess,
		});

		expect(result).toEqual({
			success: true,
			data: {
				action: "inspect",
				source: "local-jianying-cache",
				readOnly: true,
				localOnly: true,
				binaryAssetsIncluded: false,
				bundledReferenceSourceFiles: 1,
				report: { title: "叠化", uniqueResourceIds: 1 },
			},
		});
		const invocation = runProcess.mock.calls[0]?.[0];
		expect(invocation?.args).toEqual([
			scriptPath,
			"inspect",
			"--title",
			"叠化",
			"--cache-root",
			"/local/cache",
			"--database",
			"/local/cache/one.db",
		]);
		expect(invocation?.args).not.toContain("must-not-reach-child");
	});

	it.each([
		["--output-dir", { outputDirExplicit: true }],
		["--output", { output: "/tmp/report.json" }],
		["--export", { exportAfterGenerate: true }],
		["--include-output", { includeOutput: true }],
		["--save-intermediates", { saveIntermediates: true }],
	])("rejects %s before starting the skill", async (flag, overrides) => {
		const runProcess = vi.fn<RunReferenceProcess>();
		const result = await executeJianyingTransitionReference({
			options: makeOpts({
				command: "editor:jianying-transition:inventory",
				...overrides,
			}),
			scriptPath,
			runProcess,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain(`${flag} is disabled`);
		expect(runProcess).not.toHaveBeenCalled();
	});

	it("rejects a successful child process without a JSON report", async () => {
		const result = await executeJianyingTransitionReference({
			options: makeOpts({
				command: "editor:jianying-transition:inventory",
			}),
			scriptPath,
			runProcess: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("returned no JSON report");
	});

	it("refuses bundled binary or proprietary asset payloads", () => {
		writeFileSync(
			path.join(skillDirectory, "effect.bundle"),
			Buffer.from([1, 2])
		);

		expect(() => assertReferenceSkillIsSourceOnly({ scriptPath })).toThrow(
			"non-source assets"
		);
	});
});
