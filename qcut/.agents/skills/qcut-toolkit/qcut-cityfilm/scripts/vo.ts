/**
 * Batch emotional narration for the city-film workflow.
 *
 * Each cue is spoken by ByteDance Seed Audio through the QCut pipeline CLI
 * (`bun run pipeline gen tts -m seed_audio -t "<text>" -o <dir>`), which always
 * writes `<dir>/speech.mp3`. Emotion is steered by prefixing the copy with the
 * act's parenthesised directive in the copy's own language — the plain prompt
 * reads flat, the directed one carries the cut.
 */

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ActPlan, CityFilmPlan, Cue } from "./types";
import {
	moveFile,
	resolveExecutable,
	spawnCollect,
	tailMessage,
} from "./vo-exec";

/** Seed Audio is the only model that renders the emotion directives well. */
export const DEFAULT_VO_MODEL = "seed_audio";
/** Seed Audio tolerates a handful of parallel requests; four is safe. */
export const DEFAULT_VO_CONCURRENCY = 4;
/** A cue may run this far past its slot before the shot has to be relengthened. */
export const DEFAULT_FIT_TOLERANCE_SECONDS = 0.25;
/** The pipeline CLI always writes this basename into the output directory. */
export const TTS_OUTPUT_BASENAME = "speech.mp3";

/** One narration render: a prompt in, one mp3 out. */
export interface VoJob {
	cueId: string;
	/** Emotion directive + copy, exactly as handed to the TTS model. */
	prompt: string;
	/** Absolute destination, `<assetsDir>/vo/vo-<language>-<cueId>.mp3`. */
	outputFile: string;
}

export type VoJobStatus = "generated" | "skipped" | "failed";

export interface VoJobOutcome {
	job: VoJob;
	status: VoJobStatus;
	/** Present only when status is "failed". */
	error?: string;
}

export interface VoJobFailure {
	cueId: string;
	outputFile: string;
	error: string;
}

export interface VoBatchResult {
	generated: VoJob[];
	skipped: VoJob[];
	failed: VoJobFailure[];
}

export interface VoBatchOptions {
	plan: CityFilmPlan;
	/** Defaults to `planVoJobs({ plan })`; pass a subset to re-render cues. */
	jobs?: VoJob[];
	model?: string;
	concurrency?: number;
	/** Re-render cues whose mp3 already exists. */
	force?: boolean;
	/** Executable that fronts `run pipeline ...`; defaults to Bun. */
	executable?: string;
	/** Must be the QCut repository root so `bun run pipeline` resolves. */
	cwd?: string;
	/** Parent directory for the per-job scratch dirs. */
	tempRoot?: string;
	env?: NodeJS.ProcessEnv;
	onProgress?: (outcome: VoJobOutcome) => void;
}

export interface CueFit {
	fits: boolean;
	/** Seconds the narration runs past the cue slot; 0 when it fits. */
	overflowSeconds: number;
}

function roundMilliseconds({ value }: { value: number }): number {
	return Math.round(value * 1000) / 1000;
}

/**
 * Prefix the copy with the act's emotion directive. The directive already ends
 * in its own closing paren, so nothing is inserted between the two halves.
 */
export function buildTtsPrompt({
	cue,
	act,
}: {
	cue: Cue;
	act?: ActPlan;
}): string {
	const directive = act?.emotion?.trim();
	if (!directive) return cue.text;
	return `${directive}${cue.text}`;
}

export function voFileName({
	language,
	cueId,
}: {
	language: string;
	cueId: string;
}): string {
	return `vo-${language}-${cueId}.mp3`;
}

export function buildTtsArgs({
	model,
	prompt,
	outputDir,
}: {
	model: string;
	prompt: string;
	outputDir: string;
}): string[] {
	return [
		"run",
		"pipeline",
		"gen",
		"tts",
		"-m",
		model,
		"-t",
		prompt,
		"-o",
		outputDir,
		"--json",
	];
}

/**
 * One job per cue, in plan order. Nothing is filtered here — the runner decides
 * what already exists so callers can inspect the full intended set.
 */
export function planVoJobs({ plan }: { plan: CityFilmPlan }): VoJob[] {
	const actsById = new Map(plan.acts.map((act) => [act.id, act]));
	const voDir = join(plan.assetsDir, "vo");
	return plan.cues.map((cue) => ({
		cueId: cue.id,
		prompt: buildTtsPrompt({ cue, act: actsById.get(cue.actId) }),
		outputFile: join(
			voDir,
			voFileName({ language: plan.language, cueId: cue.id })
		),
	}));
}

/**
 * A long line overruns its shot, so every rendered cue is measured against the
 * slot it was written for.
 */
export function checkCueFit({
	cue,
	voDurationSeconds,
	toleranceSeconds = DEFAULT_FIT_TOLERANCE_SECONDS,
}: {
	cue: Cue;
	voDurationSeconds: number;
	toleranceSeconds?: number;
}): CueFit {
	const overflow = Math.max(0, voDurationSeconds - cue.durationSeconds);
	return {
		fits: overflow <= toleranceSeconds,
		overflowSeconds: roundMilliseconds({ value: overflow }),
	};
}

/** Prefer the documented `speech.mp3`, but accept a single renamed sibling. */
export function pickGeneratedAudioName({
	entries,
}: {
	entries: string[];
}): string | undefined {
	if (entries.includes(TTS_OUTPUT_BASENAME)) return TTS_OUTPUT_BASENAME;
	return entries.find((entry) => entry.toLowerCase().endsWith(".mp3"));
}

export function parseDurationSeconds({ stdout }: { stdout: string }): number {
	let parsed: { format?: { duration?: string } };
	try {
		parsed = JSON.parse(stdout) as { format?: { duration?: string } };
	} catch {
		throw new Error("ffprobe did not return JSON");
	}
	const duration = Number(parsed.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("ffprobe reported no usable duration");
	}
	return duration;
}

/** Bounded-concurrency map that preserves input order in the results. */
export async function runWithConcurrency<TItem, TResult>({
	items,
	limit,
	worker,
}: {
	items: TItem[];
	limit: number;
	worker: (item: TItem, index: number) => Promise<TResult>;
}): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
	let cursor = 0;
	const runners = Array.from({ length: lanes }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index] as TItem, index);
		}
	});
	await Promise.all(runners);
	return results;
}

/** Measure a rendered narration so callers can verify it fits its cue slot. */
export async function probeDurationSeconds({
	file,
	ffprobe,
	env = process.env,
}: {
	file: string;
	ffprobe?: string;
	env?: NodeJS.ProcessEnv;
}): Promise<number> {
	const outcome = await spawnCollect({
		executable: resolveExecutable({
			override: ffprobe ?? env.QCUT_CITYFILM_FFPROBE_BIN,
			name: "ffprobe",
			fallback: "ffprobe",
		}),
		args: [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"json",
			file,
		],
		env,
	});
	if (outcome.exitCode !== 0) {
		throw new Error(
			`ffprobe failed (${outcome.exitCode}) for ${file}: ${tailMessage({ text: outcome.stderr })}`
		);
	}
	return parseDurationSeconds({ stdout: outcome.stdout });
}

interface VoJobRuntime {
	model: string;
	executable: string;
	cwd?: string;
	tempRoot: string;
	force: boolean;
	env?: NodeJS.ProcessEnv;
}

/** Renders one cue into its own scratch dir. Never throws. */
async function runVoJob({
	job,
	runtime,
}: {
	job: VoJob;
	runtime: VoJobRuntime;
}): Promise<VoJobOutcome> {
	if (!runtime.force && existsSync(job.outputFile)) {
		return { job, status: "skipped" };
	}
	let workDir: string | undefined;
	try {
		mkdirSync(dirname(job.outputFile), { recursive: true });
		mkdirSync(runtime.tempRoot, { recursive: true });
		workDir = mkdtempSync(join(runtime.tempRoot, `cityfilm-vo-${job.cueId}-`));
		const outcome = await spawnCollect({
			executable: runtime.executable,
			args: buildTtsArgs({
				model: runtime.model,
				prompt: job.prompt,
				outputDir: workDir,
			}),
			cwd: runtime.cwd,
			env: runtime.env,
		});
		if (outcome.exitCode !== 0) {
			const detail = tailMessage({ text: outcome.stderr || outcome.stdout });
			throw new Error(`tts exited ${outcome.exitCode}: ${detail}`);
		}
		const produced = pickGeneratedAudioName({ entries: readdirSync(workDir) });
		if (!produced) throw new Error("tts produced no mp3");
		moveFile({ from: join(workDir, produced), to: job.outputFile });
		return { job, status: "generated" };
	} catch (error) {
		return {
			job,
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		if (workDir) rmSync(workDir, { recursive: true, force: true });
	}
}

/**
 * Render every cue's narration, skipping mp3s that already exist unless forced.
 * A single failing cue never aborts the batch; it lands in `failed` instead.
 */
export async function runVoBatch({
	plan,
	jobs,
	model = DEFAULT_VO_MODEL,
	concurrency = DEFAULT_VO_CONCURRENCY,
	force = false,
	executable,
	cwd = process.cwd(),
	tempRoot = tmpdir(),
	env = process.env,
	onProgress,
}: VoBatchOptions): Promise<VoBatchResult> {
	const runtime: VoJobRuntime = {
		model,
		executable: resolveExecutable({
			override: executable,
			name: "bun",
			fallback: process.execPath,
		}),
		cwd,
		tempRoot,
		force,
		env,
	};
	const outcomes = await runWithConcurrency<VoJob, VoJobOutcome>({
		items: jobs ?? planVoJobs({ plan }),
		limit: concurrency,
		worker: async (job) => {
			const outcome = await runVoJob({ job, runtime });
			onProgress?.(outcome);
			return outcome;
		},
	});

	const result: VoBatchResult = { generated: [], skipped: [], failed: [] };
	for (const outcome of outcomes) {
		if (outcome.status === "generated") result.generated.push(outcome.job);
		else if (outcome.status === "skipped") result.skipped.push(outcome.job);
		else {
			result.failed.push({
				cueId: outcome.job.cueId,
				outputFile: outcome.job.outputFile,
				error: outcome.error ?? "unknown error",
			});
		}
	}
	return result;
}
