import { describe, expect, test } from "bun:test";
import { createVlogPaths, parseVlogOptions } from "./options";
import {
	assertDurationParity,
	buildBackgroundArgs,
	buildCleanArgs,
	buildPortraitArgs,
	buildSubtitleArgs,
	buildTranscribeArgs,
	getPreviewTime,
	parseSrtContent,
	summarizeCleanMetadata,
} from "./workflow";

describe("qcut-vlog workflow rules", () => {
	const options = parseVlogOptions({
		argv: ["/tmp/source.mov", "-o", "/tmp/out"],
	});
	const paths = createVlogPaths({ options });

	test("cleans before transcribing the extracted clean audio", () => {
		const cleanArgs = buildCleanArgs({ options, paths });
		const transcribeArgs = buildTranscribeArgs({ options, paths });

		expect(cleanArgs.slice(0, 2)).toEqual(["edit", "clean-audio"]);
		expect(cleanArgs).toContain("--keep-padding");
		expect(transcribeArgs.slice(0, 2)).toEqual(["analyze", "transcribe"]);
		expect(transcribeArgs[transcribeArgs.indexOf("-i") + 1]).toBe(
			paths.cleanAudio
		);
		expect(transcribeArgs).not.toContain(paths.input);
	});

	test("burns the regenerated SRT onto the cleaned video with no-box default", () => {
		const args = buildSubtitleArgs({
			options,
			paths,
			workingVideo: paths.cleanVideo,
		});

		expect(args.slice(0, 2)).toEqual(["edit", "subtitle-export"]);
		expect(args[args.indexOf("-i") + 1]).toBe(paths.cleanVideo);
		expect(args[args.indexOf("-s") + 1]).toBe(paths.srt);
		expect(args[args.indexOf("--preset") + 1]).toBe("default");
	});

	test("creates an editable portrait-filtered MP4 before subtitles", () => {
		const args = buildPortraitArgs({
			options,
			paths,
			cleanVideo: paths.cleanVideo,
		});

		expect(args.slice(0, 2)).toEqual(["edit", "portrait-filter"]);
		expect(args[args.indexOf("-i") + 1]).toBe(paths.cleanVideo);
		expect(args[args.indexOf("--preset") + 1]).toBe("soft-skin");
		expect(args[args.indexOf("--beauty") + 1]).toBe("25");
		expect(args[args.indexOf("--output") + 1]).toBe(paths.portraitVideo);
	});

	test("creates an editable background composite before subtitle burn-in", () => {
		const backgroundOptions = parseVlogOptions({
			argv: [
				"/tmp/source.mov",
				"-o",
				"/tmp/out",
				"--background",
				"/tmp/office.png",
			],
		});
		const backgroundPaths = createVlogPaths({ options: backgroundOptions });
		const args = buildBackgroundArgs({
			options: backgroundOptions,
			paths: backgroundPaths,
			cleanVideo: backgroundPaths.cleanVideo,
		});

		expect(args.slice(0, 2)).toEqual(["edit", "person-cutout"]);
		expect(args[args.indexOf("--background") + 1]).toBe("/tmp/office.png");
		expect(args[args.indexOf("--cutout-output") + 1]).toBe(
			backgroundPaths.cutoutVideo
		);
		expect(args[args.indexOf("--output") + 1]).toBe(
			backgroundPaths.editableVideo
		);
		expect(args[args.indexOf("--portrait-filter") + 1]).toBe(
			"soft-skin"
		);
		expect(args[args.indexOf("--beauty") + 1]).toBe("25");
		expect(args).not.toContain(backgroundPaths.srt);
	});

	test("parses subtitle cards and chooses an active verification frame", () => {
		const entries = parseSrtContent({
			content: `1
00:00:01,000 --> 00:00:03,000
第一条字幕

2
00:00:03,100 --> 00:00:05,000
Second caption
`,
		});

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ start: 1, end: 3, text: "第一条字幕" });
		expect(getPreviewTime({ entries })).toBe(2);
	});

	test("summarizes cut categories and enforces duration parity", () => {
		const summary = summarizeCleanMetadata({
			decisions: [{ id: "a" }, { id: "b" }, { id: "c" }],
			cuts: [
				{ start: 1, end: 1.2, reason: "filler word" },
				{ start: 3, end: 4.5, reason: "1.5s silence gap" },
				{ start: 8, end: 8.3, reason: "stutter repetition" },
			],
			keeps: [
				{ start: 0, end: 1 },
				{ start: 1.2, end: 3 },
			],
		});

		expect(summary).toMatchObject({
			decisions: 3,
			cuts: 3,
			keeps: 2,
			fillerCuts: 1,
			stutterCuts: 1,
			silenceCuts: 1,
			rawCutDuration: 2,
		});
		expect(
			assertDurationParity({ workingDuration: 10, finalDuration: 10.1 })
		).toBe(0.1);
		expect(() =>
			assertDurationParity({ workingDuration: 10, finalDuration: 9 })
		).toThrow("differs");
	});
});
