import { describe, expect, it } from "vitest";
import { parseCleanAudioOptions } from "../../autoclip/clean-audio-runner.js";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs — clean-audio flags", () => {
	it("leaves removal flags undefined so the runner defaults them to true", () => {
		const opts = parseCliArgs(["edit", "clean-audio", "-i", "video.mp4"]);

		expect(opts.removeFillers).toBeUndefined();
		expect(opts.removeSilences).toBeUndefined();

		const parsed = parseCleanAudioOptions(opts);
		expect(parsed.removeFillers).toBe(true);
		expect(parsed.removeSilences).toBe(true);
	});

	it("keeps explicit --remove-fillers / --remove-silences enabled", () => {
		const opts = parseCliArgs([
			"edit",
			"clean-audio",
			"-i",
			"video.mp4",
			"--remove-fillers",
			"--remove-silences",
		]);

		expect(opts.removeFillers).toBe(true);
		expect(opts.removeSilences).toBe(true);
	});

	it("disables removal via --no-remove-fillers / --no-remove-silences", () => {
		const opts = parseCliArgs([
			"edit",
			"clean-audio",
			"-i",
			"video.mp4",
			"--no-remove-fillers",
			"--no-remove-silences",
		]);

		expect(opts.removeFillers).toBe(false);
		expect(opts.removeSilences).toBe(false);

		const parsed = parseCleanAudioOptions(opts);
		expect(parsed.removeFillers).toBe(false);
		expect(parsed.removeSilences).toBe(false);
	});
});
