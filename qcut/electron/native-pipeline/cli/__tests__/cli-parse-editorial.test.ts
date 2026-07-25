import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs editorial commands", () => {
	it("keeps path-valued --index separate from editor numeric indexes", () => {
		const plan = parseCliArgs([
			"edit",
			"plan",
			"--index",
			"./analysis/index.json",
			"--script",
			"narration.zh.txt",
			"--duration",
			"43",
		]);
		const editor = parseCliArgs([
			"editor",
			"track",
			"create",
			"--type",
			"media",
			"--index",
			"2",
		]);

		expect(plan.command).toBe("edit-plan");
		expect(plan.mediaIndexPath).toBe("./analysis/index.json");
		expect(plan.index).toBeUndefined();
		expect(plan.duration).toBe("43");
		expect(editor.index).toBe(2);
		expect(editor.mediaIndexPath).toBeUndefined();
	});

	it("accepts inspect --start/--end without colliding with record-daemon", () => {
		const inspect = parseCliArgs([
			"analyze",
			"inspect",
			"--index",
			"./analysis/index.json",
			"--source",
			"yarra.mp4",
			"--start",
			"2",
			"--end",
			"9",
		]);
		const daemon = parseCliArgs(["record-daemon", "--start"]);

		expect(inspect.command).toBe("analyze-inspect");
		expect(inspect.startTime).toBe(2);
		expect(inspect.endTime).toBe(9);
		expect(daemon.start).toBe(true);
	});

	it("parses index and verification quality options", () => {
		const index = parseCliArgs([
			"analyze",
			"index",
			"--dir",
			"./downloads",
			"--scene-threshold",
			"0.28",
			"--candidate-duration",
			"7",
			"--no-ai",
		]);
		const verify = parseCliArgs([
			"edit",
			"verify",
			"--edl",
			"edl.json",
			"--video",
			"final.mp4",
			"--cut-window",
			"1.5",
		]);

		expect(index.threshold).toBe(0.28);
		expect(index.candidateDuration).toBe(7);
		expect(index.noAi).toBe(true);
		expect(verify.edl).toBe("edl.json");
		expect(verify.video).toBe("final.mp4");
		expect(verify.cutWindow).toBe(1.5);
	});

	it("preserves an explicit hard-cut transition duration", () => {
		const plan = parseCliArgs([
			"edit",
			"plan",
			"--index",
			"./analysis/index.json",
			"--script",
			"narration.en.txt",
			"--duration",
			"43",
			"--transition-duration",
			"0",
		]);

		expect(plan.transitionDuration).toBe(0);
	});
});
