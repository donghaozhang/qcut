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
	/** Voice anchor passed as `audio_urls[0]`, when the voice is locked. */
	referenceAudioUrl?: string;
}

export type VoJobStatus = "generated" | "skipped" | "failed";

export interface VoJobOutcome {
	job: VoJob;
	status: VoJobStatus;
	/** Present only when status is "failed". */
	error?: string;
	/** Hosted URL of the rendered take, reusable as a voice anchor. */
	audioUrl?: string;
}

export interface VoJobFailure {
	cueId: string;
	outputFile: string;
	error: string;
}

export interface VoBatchResult {
	/** Anchor used (or discovered) for this batch; persist it into the plan. */
	voiceAnchorUrl?: string;
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
	/**
	 * Render the first cue alone, then anchor every remaining cue to it so the
	 * whole cut keeps one voice. Defaults on; turn off only when the plan
	 * already carries a `voiceAnchorUrl` or a single voice does not matter.
	 */
	lockVoice?: boolean;
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
 * Token that binds a rendering to the first reference clip. Seed Audio only
 * applies `audio_urls` when the prompt names the clip, so passing a reference
 * without this tag leaves the speaker free to drift between cues.
 */
export const VOICE_REFERENCE_TAG = "@Audio1";

export function buildTtsPrompt({
	cue,
	act,
	referenceAudioUrl,
}: {
	cue: Cue;
	act?: ActPlan;
	/** Anchor clip that fixes the speaker across every cue. */
	referenceAudioUrl?: string;
}): string {
	const directive = act?.emotion?.trim();
	const body = directive ? `${directive}${cue.text}` : cue.text;
	return referenceAudioUrl ? `${VOICE_REFERENCE_TAG} ${body}` : body;
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
	referenceAudioUrl,
}: {
	model: string;
	prompt: string;
	outputDir: string;
	/** Sent as `audio_urls[0]`; the prompt must also carry the tag. */
	referenceAudioUrl?: string;
}): string[] {
	const args = [
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
	];
	if (referenceAudioUrl) args.push("--audio-url", referenceAudioUrl);
	args.push("--json");
	return args;
}

/**
 * Reads the hosted audio URL out of a `gen tts --json` envelope. The URL is
 * what later cues reuse as their voice anchor, so it is kept rather than the
 * downloaded file (the model needs a URL, not a local path).
 */
export function parseTtsAudioUrl({ stdout }: { stdout: string }): string {
	const start = stdout.indexOf("{");
	if (start < 0) throw new Error("gen tts did not return JSON");
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.slice(start)) as unknown;
	} catch {
		throw new Error("gen tts returned malformed JSON");
	}
	const envelope = parsed as {
		data?: { data?: { audioUrl?: string }; audioUrl?: string };
	};
	const url = envelope.data?.data?.audioUrl ?? envelope.data?.audioUrl;
	if (typeof url !== "string" || url.length === 0) {
		throw new Error("gen tts response carried no audioUrl");
	}
	return url;
}

/**
 * One job per cue, in plan order. Nothing is filtered here — the runner decides
 * what already exists so callers can inspect the full intended set.
 */
export function planVoJobs({
	plan,
	referenceAudioUrl,
}: {
	plan: CityFilmPlan;
	/** Anchor clip URL; when set every prompt is tagged and reference-bound. */
	referenceAudioUrl?: string;
}): VoJob[] {
	const actsById = new Map(plan.acts.map((act) => [act.id, act]));
	const voDir = join(plan.assetsDir, "vo");
	const anchor = referenceAudioUrl ?? plan.voiceAnchorUrl;
	return plan.cues.map((cue) => ({
		cueId: cue.id,
		prompt: buildTtsPrompt({
			cue,
			act: actsById.get(cue.actId),
			referenceAudioUrl: anchor,
		}),
		outputFile: join(
			voDir,
			voFileName({ language: plan.language, cueId: cue.id })
		),
		referenceAudioUrl: anchor,
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
				referenceAudioUrl: job.referenceAudioUrl,
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
		let audioUrl: string | undefined;
		try {
			audioUrl = parseTtsAudioUrl({ stdout: outcome.stdout });
		} catch {
			// The mp3 is on disk either way; only voice anchoring needs the URL.
		}
		return { job, status: "generated", audioUrl };
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
	lockVoice = true,
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
	const runOne = async (job: VoJob): Promise<VoJobOutcome> => {
		const outcome = await runVoJob({ job, runtime });
		onProgress?.(outcome);
		return outcome;
	};

	// Seed Audio picks a new speaker per request, so the cues are rendered
	// against a single anchor clip: either one supplied by the plan, or the
	// first cue rendered on its own and then reused for the rest.
	let anchorUrl = plan.voiceAnchorUrl;
	const outcomes: VoJobOutcome[] = [];
	let pending = jobs ?? planVoJobs({ plan, referenceAudioUrl: anchorUrl });

	if (lockVoice && !anchorUrl && pending.length > 1) {
		const [first, ...rest] = pending;
		const firstOutcome = await runOne(first);
		outcomes.push(firstOutcome);
		anchorUrl = firstOutcome.audioUrl;
		pending = anchorUrl
			? rest.map((job) => ({
					...job,
					prompt: `${VOICE_REFERENCE_TAG} ${job.prompt}`,
					referenceAudioUrl: anchorUrl,
				}))
			: rest;
	}

	outcomes.push(
		...(await runWithConcurrency<VoJob, VoJobOutcome>({
			items: pending,
			limit: concurrency,
			worker: runOne,
		}))
	);

	const result: VoBatchResult = {
		generated: [],
		skipped: [],
		failed: [],
		voiceAnchorUrl: anchorUrl,
	};
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
