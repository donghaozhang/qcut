import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import { parseSessionLine } from "../native-pipeline/cli/cli-runner/session.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import { loadSessionState } from "../native-pipeline/cli/session-state.js";

function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "editor:session:save",
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19880",
		...overrides,
	} as CLIRunOptions;
}

const noopProgress = () => {};

describe("editor session CLI", () => {
	const tempDirs = new Set<string>();

	afterEach(() => {
		for (const dir of tempDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.clear();
	});

	it("parses --session-name in one-shot mode", () => {
		const opts = parseCliArgs([
			"editor:session:load",
			"--session-name",
			"agent-a",
		]);

		expect(opts.command).toBe("editor:session:load");
		expect(opts.sessionName).toBe("agent-a");
	});

	it("parses --session-name in session mode lines", () => {
		const opts = parseSessionLine(
			"editor:session:load --session-name agent-a",
			{}
		);

		expect(opts).not.toBeNull();
		expect(opts?.command).toBe("editor:session:load");
		expect(opts?.sessionName).toBe("agent-a");
	});

	it("saves a named session without requiring editor health", async () => {
		const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-session-cli-"));
		tempDirs.add(stateRoot);

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:session:save",
				sessionName: "agent-a",
				projectId: "proj_1",
				panel: "moyin",
				tab: "characters",
				stateDir: stateRoot,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const loaded = loadSessionState({
			sessionName: "agent-a",
			stateDir: stateRoot,
		});
		expect(loaded?.projectId).toBe("proj_1");
		expect(loaded?.lastPanel).toBe("moyin");
		expect(loaded?.lastTab).toBe("characters");
	});

	it("loads a saved named session", async () => {
		const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-session-cli-"));
		tempDirs.add(stateRoot);

		const saveResult = await handleEditorCommand(
			makeOpts({
				command: "editor:session:save",
				sessionName: "agent-b",
				projectId: "proj_2",
				panel: "properties",
				tab: "overview",
				stateDir: stateRoot,
			}),
			noopProgress
		);
		expect(saveResult.success).toBe(true);

		const loadResult = await handleEditorCommand(
			makeOpts({
				command: "editor:session:load",
				sessionName: "agent-b",
				stateDir: stateRoot,
			}),
			noopProgress
		);

		expect(loadResult.success).toBe(true);
		const data = loadResult.data as {
			session: { sessionName: string; projectId?: string; lastPanel?: string };
		};
		expect(data.session.sessionName).toBe("agent-b");
		expect(data.session.projectId).toBe("proj_2");
		expect(data.session.lastPanel).toBe("properties");
	});

	it("requires a target session name for explicit load", async () => {
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:session:load",
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--session-name");
	});
});
