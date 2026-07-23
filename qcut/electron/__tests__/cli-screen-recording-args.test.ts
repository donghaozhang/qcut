import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";

describe("CLI screen-recording args", () => {
	it("parses editor:screen-recording:force-stop command", () => {
		const opts = parseCliArgs(["editor:screen-recording:force-stop"]);
		expect(opts.command).toBe("editor:screen-recording:force-stop");
	});

	it("parses --force for editor:screen-recording:start", () => {
		const opts = parseCliArgs([
			"editor:screen-recording:start",
			"--project-id",
			"p1",
			"--force",
		]);
		expect(opts.command).toBe("editor:screen-recording:start");
		expect(opts.force).toBe(true);
	});

	it("parses capture mode and recording quality", () => {
		const opts = parseCliArgs([
			"editor:screen-recording:start",
			"--capture-mode",
			"preview",
			"--recording-quality",
			"4k",
		]);

		expect(opts.captureMode).toBe("preview");
		expect(opts.recordingQuality).toBe("4k");
	});
});
