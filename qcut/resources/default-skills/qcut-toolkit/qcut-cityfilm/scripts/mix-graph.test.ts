import { describe, expect, test } from "vitest";
import {
	assertLabelsConsumed,
	buildMixArgs,
	buildMixGraph,
	computeTimelineDuration,
	resolveVoFile,
} from "./mix-graph";
import type { CityFilmPlan } from "./types";

function createPlan(overrides: Partial<CityFilmPlan> = {}): CityFilmPlan {
	return {
		name: "melbourne",
		language: "zh",
		width: 1920,
		height: 1080,
		fps: 30,
		assetsDir: "/assets/melbourne",
		acts: [
			{
				id: "a1-dawn",
				title: "第1幕·破晓",
				startSeconds: 0,
				endSeconds: 30,
				shotSeconds: 3,
				emotion: "平静",
			},
		],
		shots: [
			{ file: "dawn.mp4", startSeconds: 0, endSeconds: 30 },
			{ file: "market.mp4", startSeconds: 10, endSeconds: 40 },
		],
		cues: [
			{
				id: "t01",
				actId: "a1-dawn",
				startSeconds: 0,
				durationSeconds: 4,
				text: "清晨",
			},
			{
				id: "t02",
				actId: "a1-dawn",
				startSeconds: 12.5,
				durationSeconds: 4,
				text: "市场",
			},
			{
				id: "t03",
				actId: "a1-dawn",
				startSeconds: 40,
				durationSeconds: 4,
				text: "黄昏",
			},
		],
		music: [
			{
				file: "music/dawn-bed.mp3",
				startSeconds: 0,
				endSeconds: 30,
				sourceOffsetSeconds: 12,
				fadeInSeconds: 2,
			},
			{
				file: "music/night-bed.mp3",
				startSeconds: 30,
				endSeconds: 55,
				sourceOffsetSeconds: 0,
				fadeOutSeconds: 3,
			},
		],
		blackTailSeconds: 2,
		subtitle: {
			fontSize: 48,
			letterSpacing: 2,
			offsetY: 320,
			titleFontSize: 72,
			titleLetterSpacing: 8,
		},
		...overrides,
	};
}

describe("qcut-cityfilm mix graph", () => {
	test("wires music, narration, and ducking for a two-cue plan", () => {
		const plan = createPlan();
		const graph = buildMixGraph({ plan });

		expect(graph.inputs).toEqual([
			"/assets/melbourne/music/dawn-bed.mp3",
			"/assets/melbourne/music/night-bed.mp3",
			"/assets/melbourne/vo/vo-zh-t01.mp3",
			"/assets/melbourne/vo/vo-zh-t02.mp3",
			"/assets/melbourne/vo/vo-zh-t03.mp3",
		]);
		expect(graph.maps).toEqual(["0:v", "[aout]"]);

		const chains = graph.filterComplex.split(";");
		expect(chains[0]).toBe("[0:a]volume=0.22[amb]");
		// Music cues take inputs 1..2, narration cues 3..5.
		expect(chains[1]).toContain("[1:a]atrim=12:42,asetpts=PTS-STARTPTS");
		expect(chains[1]).toContain("afade=t=in:st=0:d=2");
		expect(chains[2]).toContain("[2:a]atrim=0:25,asetpts=PTS-STARTPTS");
		expect(chains[2]).toContain("afade=t=out:st=22:d=3");

		// 60s of shots + a 2s black tail needs a 7s pad after music ends at 55s.
		expect(computeTimelineDuration({ plan })).toBe(62);
		expect(graph.filterComplex).toContain("anullsrc");
		expect(graph.filterComplex).toContain("atrim=duration=7");
		expect(chains.find((chain) => chain.includes("concat="))).toBe(
			"[m0][m1][mp0]concat=n=3:v=0:a=1,volume=0.5[music]"
		);

		expect(graph.filterComplex).toContain("[3:a]adelay=0|0,volume=1.6[vo0]");
		expect(graph.filterComplex).toContain(
			"[4:a]adelay=12500|12500,volume=1.6[vo1]"
		);
		expect(graph.filterComplex).toContain(
			"[5:a]adelay=40000|40000,volume=1.6[vo2]"
		);
		expect(graph.filterComplex).toContain(
			"[vo0][vo1][vo2]amix=inputs=3:normalize=0:dropout_transition=0,apad,atrim=0:62,asetpts=PTS-STARTPTS[vo]"
		);
		expect(graph.filterComplex).toContain("[vo]asplit=2[vokey][vomix]");
		expect(graph.filterComplex).toContain(
			"[amb][music]amix=inputs=2:normalize=0[bed]"
		);
		expect(graph.filterComplex).toContain(
			"[bed][vokey]sidechaincompress=threshold=0.05:ratio=7:attack=15:release=350:makeup=1[bedduck]"
		);
		expect(graph.filterComplex).toMatch(
			/\[bedduck]\[vomix]amix=inputs=2:normalize=0,alimiter=limit=0\.95,aresample=48000\[aout]$/
		);
	});

	test("pads a mid-timeline gap so concat cannot shorten the bed", () => {
		const plan = createPlan({
			shots: [{ file: "dawn.mp4", startSeconds: 0, endSeconds: 20 }],
			blackTailSeconds: 0,
			music: [
				{
					file: "music/a.mp3",
					startSeconds: 0,
					endSeconds: 5,
					sourceOffsetSeconds: 0,
				},
				{
					file: "music/b.mp3",
					startSeconds: 12,
					endSeconds: 20,
					sourceOffsetSeconds: 4,
				},
			],
			cues: [],
		});
		const graph = buildMixGraph({ plan });

		expect(graph.filterComplex).toContain("atrim=duration=7");
		expect(graph.filterComplex).toContain("[m0][mp0][m1]concat=n=3:v=0:a=1");
		// No narration means no duck stage; the bed goes straight to [aout].
		expect(graph.filterComplex).not.toContain("sidechaincompress");
		expect(graph.filterComplex).toContain(
			"[amb][music]amix=inputs=2:normalize=0,alimiter=limit=0.95,aresample=48000[aout]"
		);
	});

	test("pads the voice bus so ducking cannot truncate the film", () => {
		// Regression: sidechaincompress ends with its key input, so a voice bus
		// that stopped at the last cue cut the exported audio short (a 62s film
		// came back as 44s, and -shortest then clipped the picture too).
		const plan = createPlan({
			cues: [
				{
					id: "t01",
					actId: "a1-dawn",
					startSeconds: 2,
					durationSeconds: 4,
					text: "清晨",
				},
			],
		});
		const graph = buildMixGraph({ plan });
		expect(graph.filterComplex).toContain(
			"[vo0]amix=inputs=1:normalize=0:dropout_transition=0,apad,atrim=0:62,asetpts=PTS-STARTPTS[vo]"
		);
	});

	test("honours custom levels and a non-zero video input index", () => {
		const graph = buildMixGraph({
			plan: createPlan(),
			levels: { ambience: 0.1, music: 0.4, voice: 2, duckRatio: 12 },
			videoInputIndex: 2,
		});
		expect(graph.filterComplex).toContain("[2:a]volume=0.1[amb]");
		expect(graph.filterComplex).toContain("[3:a]atrim=12:42");
		expect(graph.filterComplex).toContain("[5:a]adelay=0|0,volume=2[vo0]");
		expect(graph.filterComplex).toContain("ratio=12:attack=15");
		expect(graph.maps).toEqual(["2:v", "[aout]"]);
	});

	test("rejects overlapping or empty music cues", () => {
		expect(() =>
			buildMixGraph({
				plan: createPlan({
					music: [
						{
							file: "a.mp3",
							startSeconds: 0,
							endSeconds: 30,
							sourceOffsetSeconds: 0,
						},
						{
							file: "b.mp3",
							startSeconds: 20,
							endSeconds: 40,
							sourceOffsetSeconds: 0,
						},
					],
				}),
			})
		).toThrow("overlaps the previous cue");
		expect(() =>
			buildMixGraph({
				plan: createPlan({
					music: [
						{
							file: "a.mp3",
							startSeconds: 5,
							endSeconds: 5,
							sourceOffsetSeconds: 0,
						},
					],
				}),
			})
		).toThrow("non-positive length");
	});

	test("resolves VO filenames with the vo.ts naming rule", () => {
		expect(
			resolveVoFile({ assetsDir: "/a", language: "en", cueId: "t04" })
		).toBe("/a/vo/vo-en-t04.mp3");
	});
});

describe("qcut-cityfilm label guard", () => {
	test("accepts a graph whose every label is consumed", () => {
		const graph = buildMixGraph({ plan: createPlan() });
		expect(() =>
			assertLabelsConsumed({
				filterComplex: graph.filterComplex,
				outputLabels: ["aout"],
			})
		).not.toThrow();
	});

	test("rejects an orphan label that ffmpeg would abort on", () => {
		const orphaned = [
			"[0:a]volume=0.2[amb]",
			"[1:a]volume=0.5[music]",
			"[2:a]volume=1.6[strays]",
			"[amb][music]amix=inputs=2:normalize=0[aout]",
		].join(";");
		expect(() =>
			assertLabelsConsumed({ filterComplex: orphaned, outputLabels: ["aout"] })
		).toThrow("[strays]");
		expect(() =>
			assertLabelsConsumed({ filterComplex: orphaned, outputLabels: ["aout"] })
		).toThrow("nothing consumes");
	});

	test("rejects dangling references and duplicate labels", () => {
		expect(() =>
			assertLabelsConsumed({
				filterComplex: "[0:a]volume=0.2[amb];[amb][music]amix=inputs=2[aout]",
			})
		).toThrow("never produced");
		expect(() =>
			assertLabelsConsumed({
				filterComplex:
					"[0:a]volume=0.2[amb];[1:a]volume=0.5[amb];[amb]anull[aout]",
			})
		).toThrow("more than once");
	});

	test("treats the last chain's outputs as terminal by default", () => {
		expect(() =>
			assertLabelsConsumed({
				filterComplex: "[0:a]volume=0.2[amb];[amb]anull[aout]",
			})
		).not.toThrow();
	});
});

describe("qcut-cityfilm mix arguments", () => {
	test("copies the picture and encodes only the new bed", () => {
		const graph = buildMixGraph({ plan: createPlan() });
		const args = buildMixArgs({
			videoPath: "/out/picture.mp4",
			outputPath: "/out/final.mp4",
			graph,
		});

		expect(args.slice(0, 3)).toEqual(["-y", "-i", "/out/picture.mp4"]);
		expect(args.filter((value) => value === "-i")).toHaveLength(
			1 + graph.inputs.length
		);
		const filterIndex = args.indexOf("-filter_complex");
		expect(args[filterIndex + 1]).toBe(graph.filterComplex);
		expect(args.slice(filterIndex + 2)).toEqual([
			"-map",
			"0:v",
			"-map",
			"[aout]",
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-shortest",
			"/out/final.mp4",
		]);
	});

	test("refuses to overwrite the exported picture", () => {
		const graph = buildMixGraph({ plan: createPlan() });
		expect(() =>
			buildMixArgs({
				videoPath: "/out/picture.mp4",
				outputPath: "/out/picture.mp4",
				graph,
			})
		).toThrow("cannot replace the exported picture");
	});
});
