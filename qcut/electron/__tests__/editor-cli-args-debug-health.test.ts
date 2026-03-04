import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";

describe("Editor CLI args — debug trace and deep health", () => {
	it("parses --debug-trace for editor:editing:auto-edit", () => {
		const opts = parseCliArgs([
			"editor:editing:auto-edit",
			"--project-id",
			"p1",
			"--element-id",
			"e1",
			"--media-id",
			"m1",
			"--debug-trace",
		]);

		expect(opts.command).toBe("editor:editing:auto-edit");
		expect(opts.debugTrace).toBe(true);
	});

	it("debugTrace defaults to false", () => {
		const opts = parseCliArgs([
			"editor:editing:auto-edit",
			"--project-id",
			"p1",
			"--element-id",
			"e1",
			"--media-id",
			"m1",
		]);

		expect(opts.debugTrace).toBe(false);
	});

	it("parses --deep for editor:health", () => {
		const opts = parseCliArgs(["editor:health", "--deep", "--status-only"]);

		expect(opts.command).toBe("editor:health");
		expect(opts.deep).toBe(true);
		expect(opts.statusOnly).toBe(true);
	});
});
