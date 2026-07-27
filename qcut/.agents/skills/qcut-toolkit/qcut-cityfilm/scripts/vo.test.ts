import { describe, expect, it, test } from "vitest";
import type { ActPlan, CityFilmPlan, Cue } from "./types";
import {
	buildTtsArgs,
	buildTtsPrompt,
	checkCueFit,
	parseDurationSeconds,
	pickGeneratedAudioName,
	parseTtsAudioUrl,
	planVoJobs,
	runWithConcurrency,
	VOICE_REFERENCE_TAG,
	voFileName,
} from "./vo";
import { spawnCollect } from "./vo-exec";
import { resolveExecutable, tailMessage } from "./vo-exec";

const act: ActPlan = {
	id: "a1-return",
	title: "第1幕·归来",
	startSeconds: 0,
	endSeconds: 30,
	shotSeconds: 3,
	emotion: "(用温柔、怀旧、带一点感慨的语气)",
};

const cue: Cue = {
	id: "t04",
	actId: "a1-return",
	startSeconds: 12,
	durationSeconds: 4,
	text: "好久不见,墨尔本。",
};

function makePlan({ overrides }: { overrides?: Partial<CityFilmPlan> } = {}) {
	const plan: CityFilmPlan = {
		name: "melbourne",
		language: "zh",
		width: 1920,
		height: 1080,
		fps: 30,
		assetsDir: "/films/melbourne/assets",
		acts: [
			act,
			{
				id: "a2-market",
				title: "第2幕·市场",
				startSeconds: 30,
				endSeconds: 60,
				shotSeconds: 2,
				emotion: "(用明快、好奇的语气)",
			},
		],
		shots: [],
		cues: [
			cue,
			{
				id: "t05",
				actId: "a2-market",
				startSeconds: 31,
				durationSeconds: 3,
				text: "市场醒了。",
			},
			{
				id: "t06",
				actId: "a9-missing",
				startSeconds: 40,
				durationSeconds: 3,
				text: "没有情绪指令。",
			},
		],
		music: [],
		blackTailSeconds: 2,
		subtitle: {
			fontSize: 48,
			letterSpacing: 2,
			offsetY: 380,
			titleFontSize: 72,
			titleLetterSpacing: 8,
		},
	};
	return { ...plan, ...overrides };
}

describe("qcut-cityfilm vo prompts", () => {
	test("prefixes the act emotion directive with no extra separator", () => {
		expect(buildTtsPrompt({ cue, act })).toBe(
			"(用温柔、怀旧、带一点感慨的语气)好久不见,墨尔本。"
		);
	});

	test("falls back to the plain copy when no directive is available", () => {
		expect(buildTtsPrompt({ cue })).toBe("好久不见,墨尔本。");
		expect(buildTtsPrompt({ cue, act: { ...act, emotion: "   " } })).toBe(
			"好久不见,墨尔本。"
		);
	});

	test("names VO files by language and cue id", () => {
		expect(voFileName({ language: "zh", cueId: "t04" })).toBe("vo-zh-t04.mp3");
		expect(voFileName({ language: "en", cueId: "t12" })).toBe("vo-en-t12.mp3");
	});

	test("builds the pipeline TTS argv", () => {
		expect(
			buildTtsArgs({
				model: "seed_audio",
				prompt: "(用温柔的语气)好久不见。",
				outputDir: "/tmp/vo-t04",
			})
		).toEqual([
			"run",
			"pipeline",
			"gen",
			"tts",
			"-m",
			"seed_audio",
			"-t",
			"(用温柔的语气)好久不见。",
			"-o",
			"/tmp/vo-t04",
			"--json",
		]);
	});
});

describe("qcut-cityfilm vo job planning", () => {
	test("emits one job per cue resolved under assetsDir/vo", () => {
		const jobs = planVoJobs({ plan: makePlan() });

		expect(jobs).toHaveLength(3);
		expect(jobs[0]).toEqual({
			cueId: "t04",
			prompt: "(用温柔、怀旧、带一点感慨的语气)好久不见,墨尔本。",
			outputFile: "/films/melbourne/assets/vo/vo-zh-t04.mp3",
		});
		expect(jobs[1]?.prompt).toBe("(用明快、好奇的语气)市场醒了。");
		expect(jobs[1]?.outputFile).toBe(
			"/films/melbourne/assets/vo/vo-zh-t05.mp3"
		);
		// An unknown act id must not drop the cue — it renders undirected.
		expect(jobs[2]?.prompt).toBe("没有情绪指令。");
	});

	test("follows the plan language into every filename", () => {
		const jobs = planVoJobs({
			plan: makePlan({ overrides: { language: "en" } }),
		});
		expect(jobs.map((job) => job.outputFile)).toEqual([
			"/films/melbourne/assets/vo/vo-en-t04.mp3",
			"/films/melbourne/assets/vo/vo-en-t05.mp3",
			"/films/melbourne/assets/vo/vo-en-t06.mp3",
		]);
	});
});

describe("qcut-cityfilm cue fit", () => {
	test("accepts narration up to the tolerance and rejects beyond it", () => {
		expect(checkCueFit({ cue, voDurationSeconds: 3.2 })).toEqual({
			fits: true,
			overflowSeconds: 0,
		});
		expect(checkCueFit({ cue, voDurationSeconds: 4 })).toEqual({
			fits: true,
			overflowSeconds: 0,
		});
		expect(
			checkCueFit({ cue, voDurationSeconds: 4.25, toleranceSeconds: 0.25 })
		).toEqual({ fits: true, overflowSeconds: 0.25 });
		expect(
			checkCueFit({ cue, voDurationSeconds: 4.26, toleranceSeconds: 0.25 })
		).toEqual({ fits: false, overflowSeconds: 0.26 });
		expect(
			checkCueFit({ cue, voDurationSeconds: 6.5, toleranceSeconds: 0 })
		).toEqual({ fits: false, overflowSeconds: 2.5 });
	});
});

describe("qcut-cityfilm vo runner helpers", () => {
	test("prefers speech.mp3 and falls back to any mp3", () => {
		expect(
			pickGeneratedAudioName({ entries: ["meta.json", "speech.mp3"] })
		).toBe("speech.mp3");
		expect(
			pickGeneratedAudioName({ entries: ["meta.json", "seed-out.MP3"] })
		).toBe("seed-out.MP3");
		expect(pickGeneratedAudioName({ entries: ["meta.json"] })).toBeUndefined();
	});

	test("reads the ffprobe duration payload", () => {
		expect(
			parseDurationSeconds({ stdout: '{"format":{"duration":"3.744000"}}' })
		).toBeCloseTo(3.744, 3);
		expect(() => parseDurationSeconds({ stdout: "not json" })).toThrow(
			"did not return JSON"
		);
		expect(() => parseDurationSeconds({ stdout: "{}" })).toThrow(
			"no usable duration"
		);
	});

	test("bounds concurrency while preserving input order", async () => {
		let active = 0;
		let peak = 0;
		const results = await runWithConcurrency<number, string>({
			items: [1, 2, 3, 4, 5, 6, 7],
			limit: 3,
			worker: async (item) => {
				active += 1;
				peak = Math.max(peak, active);
				await new Promise((done) => setTimeout(done, 5));
				active -= 1;
				return `job-${item}`;
			},
		});

		expect(peak).toBeLessThanOrEqual(3);
		expect(results).toEqual([
			"job-1",
			"job-2",
			"job-3",
			"job-4",
			"job-5",
			"job-6",
			"job-7",
		]);
		expect(
			await runWithConcurrency<number, number>({
				items: [],
				limit: 4,
				worker: async (item) => item,
			})
		).toEqual([]);
	});

	test("condenses child output into one error line", () => {
		expect(tailMessage({ text: "a\nb\nc\nd\ne\n" })).toBe("c | d | e");
		expect(tailMessage({ text: "only\n", lines: 3 })).toBe("only");
	});

	test("prefers an explicit executable override over PATH lookup", () => {
		expect(
			resolveExecutable({
				override: "/opt/bun/bin/bun",
				name: "bun",
				fallback: "/usr/bin/node",
			})
		).toBe("/opt/bun/bin/bun");
		expect(
			resolveExecutable({
				name: "definitely-not-a-real-binary-9f2c",
				fallback: "fallback-bin",
			})
		).toBe("fallback-bin");
	});
});

describe("voice locking", () => {
	const anchoredPlan = makePlan({
		overrides: { voiceAnchorUrl: "https://fal.media/anchor.mp3" },
	});

	it("tags the prompt only when a reference is supplied", () => {
		const plan = makePlan();
		const [firstCue] = plan.cues;
		const [firstAct] = plan.acts;
		expect(
			buildTtsPrompt({ cue: firstCue, act: firstAct })
		).not.toContain(VOICE_REFERENCE_TAG);
		expect(
			buildTtsPrompt({
				cue: firstCue,
				act: firstAct,
				referenceAudioUrl: "https://x/a.mp3",
			})
		).toMatch(new RegExp(`^${VOICE_REFERENCE_TAG} `));
	});

	it("passes the anchor through planVoJobs", () => {
		const jobs = planVoJobs({ plan: anchoredPlan });
		expect(jobs.every((job) => job.referenceAudioUrl === anchoredPlan.voiceAnchorUrl)).toBe(true);
		expect(jobs.every((job) => job.prompt.startsWith(VOICE_REFERENCE_TAG))).toBe(
			true
		);
	});

	it("adds --audio-url to the CLI args when anchored", () => {
		const args = buildTtsArgs({
			model: "seed_audio",
			prompt: "@Audio1 hi",
			outputDir: "/tmp/out",
			referenceAudioUrl: "https://fal.media/anchor.mp3",
		});
		expect(args).toContain("--audio-url");
		expect(args[args.indexOf("--audio-url") + 1]).toBe(
			"https://fal.media/anchor.mp3"
		);
		expect(args.at(-1)).toBe("--json");
	});

	it("omits --audio-url when no anchor is set", () => {
		const args = buildTtsArgs({
			model: "seed_audio",
			prompt: "hi",
			outputDir: "/tmp/out",
		});
		expect(args).not.toContain("--audio-url");
	});

	it("reads the hosted url out of a gen tts envelope", () => {
		const stdout = `$ bun run pipeline\n${JSON.stringify({
			status: "ok",
			data: { data: { audioUrl: "https://fal.media/x.mp3" } },
		})}`;
		expect(parseTtsAudioUrl({ stdout })).toBe("https://fal.media/x.mp3");
		expect(() => parseTtsAudioUrl({ stdout: "no json here" })).toThrow();
		expect(() =>
			parseTtsAudioUrl({ stdout: JSON.stringify({ status: "ok", data: {} }) })
		).toThrow();
	});
});

describe("spawnCollect timeout", () => {
	it("kills a stalled child and reports a non-zero exit", async () => {
		const outcome = await spawnCollect({
			executable: "sleep",
			args: ["30"],
			timeoutMs: 150,
		});
		expect(outcome.exitCode).toBe(124);
		expect(outcome.stderr).toContain("timed out");
	});

	it("leaves a fast child untouched", async () => {
		const outcome = await spawnCollect({
			executable: "echo",
			args: ["ok"],
			timeoutMs: 5000,
		});
		expect(outcome.exitCode).toBe(0);
		expect(outcome.stdout.trim()).toBe("ok");
	});
});
