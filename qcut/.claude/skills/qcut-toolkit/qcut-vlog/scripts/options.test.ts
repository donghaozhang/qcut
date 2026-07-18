import { describe, expect, test } from "bun:test";
import { createVlogPaths, parseVlogOptions } from "./options";

describe("qcut-vlog options", () => {
	test("uses safe talking-head defaults", () => {
		const options = parseVlogOptions({
			argv: ["clips/episode.MOV"],
			cwd: "/tmp/project",
		});

		expect(options).toMatchObject({
			input: "/tmp/project/clips/episode.MOV",
			outputDir: "/tmp/project/clips/episode-vlog",
			finalName: "episode_vlog.mp4",
			backgroundFit: "cover",
			portraitFilter: "soft-skin",
			beauty: 25,
			preset: "default",
			model: "scribe_v2",
			silenceThreshold: 1,
			keepPadding: 0.15,
			srtMaxWords: 8,
			srtMaxDuration: 4,
		});

		const paths = createVlogPaths({ options });
		expect(paths.cleanVideo).toBe(
			"/tmp/project/clips/episode-vlog/episode_clean.MOV"
		);
		expect(paths.portraitVideo).toBe(
			"/tmp/project/clips/episode-vlog/episode_vlog_portrait.mp4"
		);
		expect(paths.cleanAudio).toBe(
			"/tmp/project/clips/episode-vlog/episode_clean_audio.mp3"
		);
		expect(paths.cutoutVideo).toBe(
			"/tmp/project/clips/episode-vlog/episode_cutout.webm"
		);
		expect(paths.editableVideo).toBe(
			"/tmp/project/clips/episode-vlog/episode_vlog_editable.mp4"
		);
		expect(paths.finalVideo).toBe(
			"/tmp/project/clips/episode-vlog/episode_vlog.mp4"
		);
	});

	test("accepts deliberate workflow overrides", () => {
		const options = parseVlogOptions({
			argv: [
				"input.mp4",
				"--background",
				"office.png",
				"--background-fit",
				"contain",
				"--portrait-filter",
				"studio-clear",
				"--filter-intensity",
				"68",
				"--beauty",
				"15",
				"--preset",
				"bold",
				"--style",
				'{"fontSize":56,"bgOpacity":0}',
				"--silence-threshold",
				"1.5",
				"--keep-padding",
				"0.2",
				"--srt-max-words",
				"12",
				"--language",
				"zh",
			],
			cwd: "/tmp",
		});

		expect(options.preset).toBe("bold");
		expect(options.background).toBe("/tmp/office.png");
		expect(options.backgroundFit).toBe("contain");
		expect(options.portraitFilter).toBe("studio-clear");
		expect(options.filterIntensity).toBe(68);
		expect(options.beauty).toBe(15);
		expect(options.style).toContain('"bgOpacity":0');
		expect(options.silenceThreshold).toBe(1.5);
		expect(options.keepPadding).toBe(0.2);
		expect(options.srtMaxWords).toBe(12);
		expect(options.language).toBe("zh");
	});

	test("rejects unsafe or ambiguous combinations", () => {
		expect(() =>
			parseVlogOptions({ argv: ["input.mp4", "--resume", "--force"] })
		).toThrow("cannot be used together");
		expect(() =>
			parseVlogOptions({ argv: ["input.mp4", "--srt-max-words", "0"] })
		).toThrow("between 1 and 50");
		expect(() =>
			parseVlogOptions({ argv: ["input.mp4", "--background-fit", "tile"] })
		).toThrow("background-fit");
		expect(() =>
			parseVlogOptions({ argv: ["input.mp4", "--beauty", "101"] })
		).toThrow("between 0 and 100");
		expect(() =>
			parseVlogOptions({ argv: ["input.mp4", "--final-name", "../bad.mp4"] })
		).toThrow("without directories");
		const overwriteSource = parseVlogOptions({
			argv: [
				"/tmp/input.mp4",
				"--output-dir",
				"/tmp",
				"--final-name",
				"input.mp4",
			],
		});
		expect(() => createVlogPaths({ options: overwriteSource })).toThrow(
			"cannot replace the source"
		);
	});
});
