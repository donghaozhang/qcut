import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native-pipeline/cli/cli-handlers-editor.js", () => ({
	handleEditorCommand: vi.fn(async () => ({
		success: true,
		data: { ok: true },
	})),
}));

import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { CLIPipelineRunner } from "../native-pipeline/cli/cli-runner.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import { parseSessionLine } from "../native-pipeline/cli/cli-runner/session.js";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import {
	applySessionStateToOptions,
	createEmptySessionState,
	loadSessionState,
	saveSessionState,
	updateSessionState,
} from "../native-pipeline/cli/session-state.js";

function defaultOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
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

describe("session state persistence", () => {
	const tempDirs = new Set<string>();

	beforeEach(() => {
		vi.mocked(handleEditorCommand).mockClear();
	});

	afterEach(() => {
		for (const dir of tempDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.clear();
	});

	it("saves and loads session state round-trip", () => {
		const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-session-"));
		tempDirs.add(stateRoot);
		const state = updateSessionState({
			sessionState: createEmptySessionState({ sessionName: "agent-a" }),
			options: defaultOptions({
				command: "editor:ui:switch-panel",
				projectId: "proj_1",
				panel: "moyin",
				tab: "characters",
			}),
			result: { success: true, data: { ok: true } },
		});

		saveSessionState({ sessionState: state, stateDir: stateRoot });
		const loaded = loadSessionState({
			sessionName: "agent-a",
			stateDir: stateRoot,
		});

		expect(loaded).not.toBeNull();
		expect(loaded?.projectId).toBe("proj_1");
		expect(loaded?.lastPanel).toBe("moyin");
		expect(loaded?.lastTab).toBe("characters");
		expect(loaded?.commandHistory).toHaveLength(1);
	});

	it("hydrates missing options from loaded session state", () => {
		const state = updateSessionState({
			sessionState: createEmptySessionState({ sessionName: "agent-a" }),
			options: defaultOptions({
				command: "editor:ui:switch-panel",
				projectId: "proj_2",
				panel: "properties",
				tab: "overview",
			}),
			result: { success: true },
		});

		const hydrated = applySessionStateToOptions({
			options: defaultOptions({ command: "editor:timeline:export" }),
			sessionState: state,
		});

		expect(hydrated.projectId).toBe("proj_2");
		expect(hydrated.panel).toBe("properties");
		expect(hydrated.tab).toBe("overview");
	});

	it("parses --resume and --state-dir from one-shot CLI args", () => {
		const opts = parseCliArgs([
			"editor:timeline:export",
			"--resume",
			"agent-a",
			"--state-dir",
			"/tmp/qcut-state",
		]);

		expect(opts.resume).toBe("agent-a");
		expect(opts.stateDir).toBe("/tmp/qcut-state");
	});

	it("inherits sticky session state defaults in session parsing", () => {
		const opts = parseSessionLine("editor:timeline:export", {
			resume: "agent-a",
			stateDir: "/tmp/qcut-state",
			projectId: "proj_sticky",
			panel: "moyin",
			tab: "characters",
			session: true,
		});

		expect(opts).not.toBeNull();
		expect(opts?.resume).toBe("agent-a");
		expect(opts?.stateDir).toBe("/tmp/qcut-state");
		expect(opts?.projectId).toBe("proj_sticky");
		expect(opts?.panel).toBe("moyin");
		expect(opts?.tab).toBe("characters");
	});

	it("hydrates resumed one-shot commands before dispatch", async () => {
		const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-session-"));
		tempDirs.add(stateRoot);
		saveSessionState({
			sessionState: {
				...createEmptySessionState({ sessionName: "agent-a" }),
				projectId: "proj_resume",
				commandHistory: ["editor:navigator:open project=proj_resume"],
				savedAt: new Date().toISOString(),
			},
			stateDir: stateRoot,
		});

		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			defaultOptions({
				command: "editor:timeline:export",
				resume: "agent-a",
				stateDir: stateRoot,
			}),
			vi.fn()
		);

		expect(result.success).toBe(true);
		expect(handleEditorCommand).toHaveBeenCalledTimes(1);
		const [calledOptions] = vi.mocked(handleEditorCommand).mock.calls[0] ?? [];
		expect((calledOptions as CLIRunOptions).projectId).toBe("proj_resume");
	});

	it("autosaves updated session state after successful command execution", async () => {
		const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-session-"));
		tempDirs.add(stateRoot);

		const runner = new CLIPipelineRunner();
		const result = await runner.run(
			defaultOptions({
				command: "editor:ui:switch-panel",
				projectId: "proj_saved",
				panel: "moyin",
				tab: "characters",
				resume: "agent-b",
				stateDir: stateRoot,
			}),
			vi.fn()
		);

		expect(result.success).toBe(true);
		const loaded = loadSessionState({
			sessionName: "agent-b",
			stateDir: stateRoot,
		});
		expect(loaded).not.toBeNull();
		expect(loaded?.projectId).toBe("proj_saved");
		expect(loaded?.lastPanel).toBe("moyin");
		expect(loaded?.lastTab).toBe("characters");
		expect(loaded?.commandHistory.at(-1)).toContain("editor:ui:switch-panel");
	});
});
