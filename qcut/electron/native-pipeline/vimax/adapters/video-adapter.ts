/**
 * Video Generator Adapter for ViMax agents.
 *
 * Thin wrapper around `callModelApi` that looks the model up in the
 * shared `ModelRegistry`. Routes to FAL or GMI based on the
 * registry's `providerBackend` field, so vimax pipelines pick up new
 * providers automatically when they're registered. Falls back to mock
 * generation when the appropriate API key isn't configured.
 *
 * Ported from: vimax/adapters/video_adapter.py (originally FAL-only;
 * migrated to registry-based routing — see
 * docs/task/gmi-provider/vimax-video-adapter-gmi-fix.md).
 */

import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
	BaseAdapter,
	type AdapterConfig,
	createAdapterConfig,
} from "./base-adapter.js";
import { callModelApi, downloadOutput } from "../../infra/api-caller.js";
import { ModelRegistry } from "../../infra/registry.js";
import type { VideoOutput, ImageOutput } from "../types/output.js";
import { createVideoOutput } from "../types/output.js";

const execFileAsync = promisify(execFile);

export interface VideoAdapterConfig extends AdapterConfig {
	duration: number;
	fps: number;
	output_dir: string;
}

export function createVideoAdapterConfig(
	partial?: Partial<VideoAdapterConfig>
): VideoAdapterConfig {
	return {
		...createAdapterConfig({ provider: "fal", model: "kling" }),
		duration: 5.0,
		fps: 24,
		output_dir: "media/generated/vimax/videos",
		...partial,
	};
}

/**
 * Legacy keys that used to live in the hardcoded MODEL_MAP but aren't
 * registered in the ModelRegistry under that exact key. Map them to the
 * canonical registry entry so callers passing older keys keep working.
 */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
	// Old "kling" (v1) is not in the registry — route to the v2.1 successor,
	// which matches the previous MODEL_MAP fallback in effect.
	kling: "kling_2_1",
};

type VideoProviderBackend = "fal" | "gmi" | "imarouter";

interface ResolvedModelSpec {
	/** The canonical registry key (after alias resolution). */
	canonicalKey: string;
	/** Provider-specific endpoint path (e.g. "fal-ai/kling-video/v2.1/…"). */
	endpoint: string;
	/** Which backend `callModelApi` should use. */
	providerBackend: VideoProviderBackend;
	/** Registry defaults required by providers like IMA Router. */
	defaults: Record<string, unknown>;
	/** Best-effort cost-per-second for the returned VideoOutput. */
	costPerSecond: number;
}

/** Look up a model spec via ModelRegistry, honouring legacy aliases. */
export function resolveVideoModelSpec(model: string): ResolvedModelSpec {
	const canonicalKey = LEGACY_MODEL_ALIASES[model] ?? model;
	if (!ModelRegistry.has(canonicalKey)) {
		throw new Error(
			`Unknown video model "${model}". ` +
				"Run `qcut system models --category image_to_video --json` to list supported keys."
		);
	}
	const def = ModelRegistry.get(canonicalKey);
	return {
		canonicalKey,
		endpoint: def.endpoint,
		providerBackend: (def.providerBackend as VideoProviderBackend) ?? "fal",
		defaults: def.defaults ?? {},
		costPerSecond: extractCostPerSecond(def.pricing),
	};
}

/** Errors that indicate a transient upstream failure worth retrying. */
const TRANSIENT_ERROR_PATTERNS = [
	/context deadline exceeded/i,
	/client\.timeout/i,
	/failed to send http request/i,
	/connection reset/i,
	/econnreset/i,
	/etimedout/i,
	/enotfound/i,
	/socket hang up/i,
	/temporarily unavailable/i,
	/service unavailable/i,
];

/**
 * Classify an API error message for retry eligibility. Returns true for
 * 5xx responses, timeouts, and network errors that commonly resolve on
 * a retry. Returns false for 4xx responses — those are caused by bad
 * payloads / missing params / auth failures and will never self-heal.
 */
export function isRetryableVideoError(errorMessage: string): boolean {
	if (!errorMessage) return false;
	// GMI/FAL surface errors as "provider error NNN: …". 5xx == server
	// problem; 4xx == our request is wrong.
	const statusMatch = errorMessage.match(/error\s+(\d{3})/i);
	if (statusMatch) {
		const status = Number.parseInt(statusMatch[1], 10);
		if (status >= 500 && status <= 599) return true;
		if (status >= 400 && status <= 499) return false;
	}
	return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(errorMessage));
}

export interface RetryConfig {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	/** Injected in tests so we don't actually sleep. */
	sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Invoke a video API call with exponential-backoff retries on transient
 * failures. First attempt runs without delay; subsequent attempts back
 * off at `baseDelayMs`, `baseDelayMs*3`, `baseDelayMs*9`, capped at
 * `maxDelayMs`.
 *
 * Exposed for testability — production code uses the default parameters.
 */
export async function callVideoApiWithRetry<
	T extends { success: boolean; error?: string },
>(call: () => Promise<T>, config: RetryConfig = {}): Promise<T> {
	const maxAttempts = config.maxAttempts ?? 3;
	const baseDelayMs = config.baseDelayMs ?? 5_000;
	const maxDelayMs = config.maxDelayMs ?? 60_000;
	const sleep =
		config.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

	let lastResult: T | undefined;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const result = await call();
		lastResult = result;
		if (result.success) return result;
		const errMsg = result.error ?? "";
		if (!isRetryableVideoError(errMsg)) return result;
		const isLastAttempt = attempt === maxAttempts - 1;
		if (isLastAttempt) return result;
		const delayMs = Math.min(baseDelayMs * 3 ** attempt, maxDelayMs);
		console.warn(
			`[vimax.video] Transient error (attempt ${attempt + 1}/${maxAttempts}): ${errMsg.slice(0, 120)}. Retrying in ${delayMs}ms...`
		);
		await sleep(delayMs);
	}
	// Unreachable — loop always returns before this
	return lastResult as T;
}

/**
 * Build the provider-specific image payload field.
 *
 *   - FAL's image-to-video endpoints take `image_url` and accept remote
 *     URLs or data URIs directly.
 *   - GMI's endpoints usually take `image`; Seedance I2V takes
 *     `first_frame`. Both accept remote URLs or raw base64 strings.
 *
 * Local filesystem paths are read from disk and encoded accordingly.
 */
export function buildImageField({
	imagePath,
	provider,
	modelKey = "",
}: {
	imagePath: string;
	provider: VideoProviderBackend;
	modelKey?: string;
}): Record<string, unknown> {
	const isRemote = /^https?:/i.test(imagePath);
	const isDataUri = imagePath.startsWith("data:");

	if (provider === "gmi") {
		const imageValue =
			isRemote || isDataUri
				? imagePath
				: fs.readFileSync(imagePath).toString("base64");
		if (isGmiSeedanceI2vModel({ modelKey })) {
			return { first_frame: imageValue };
		}
		return { image: imageValue };
	}

	if (provider === "imarouter") {
		if (isRemote || isDataUri) {
			return { images: [imagePath] };
		}
		const ext = path.extname(imagePath).slice(1).toLowerCase() || "png";
		const buffer = fs.readFileSync(imagePath);
		return {
			images: [`data:image/${ext};base64,${buffer.toString("base64")}`],
		};
	}

	// FAL path
	if (isRemote || isDataUri) {
		return { image_url: imagePath };
	}
	// Local file — convert to data URI (FAL accepts this; pure base64 won't
	// pass the provider's content-type sniffing).
	const ext = path.extname(imagePath).slice(1).toLowerCase() || "png";
	const buffer = fs.readFileSync(imagePath);
	return {
		image_url: `data:image/${ext};base64,${buffer.toString("base64")}`,
	};
}

function isGmiSeedanceI2vModel({ modelKey }: { modelKey: string }): boolean {
	return /^gmi_seedance_2_0(?:_fast)?_260128_i2v$/.test(modelKey);
}

function buildDurationField({
	duration,
	spec,
}: {
	duration: number;
	spec: ResolvedModelSpec;
}): string | number {
	if (
		spec.providerBackend === "gmi" &&
		isGmiSeedanceI2vModel({ modelKey: spec.canonicalKey })
	) {
		return Math.round(duration);
	}
	return String(Math.round(duration));
}

/**
 * Registry pricing is either a number or an object like
 * `{ no_sound, with_sound }` / `{ std, pro, std_sound, pro_sound }`.
 * Pick the cheapest numeric entry as a conservative default — the
 * authoritative cost for billing is computed server-side by
 * credit-estimator when proxy mode is used.
 */
function extractCostPerSecond(pricing: unknown): number {
	if (typeof pricing === "number") return pricing;
	if (pricing && typeof pricing === "object") {
		const numericValues = Object.values(
			pricing as Record<string, unknown>
		).filter(
			(v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0
		);
		if (numericValues.length > 0) return Math.min(...numericValues);
	}
	// Last-resort default — same order of magnitude as the old COST_PER_SECOND.
	return 0.03;
}

export class VideoGeneratorAdapter extends BaseAdapter<
	Record<string, unknown>,
	VideoOutput
> {
	declare config: VideoAdapterConfig;
	private _hasFalKey = false;
	private _hasGmiKey = false;
	private _hasImaRouterKey = false;

	constructor(config?: Partial<VideoAdapterConfig>) {
		super(createVideoAdapterConfig(config));
	}

	/**
	 * Returns list of supported video model keys.
	 * Pulled live from the ModelRegistry's `image_to_video` category plus
	 * the legacy aliases we still accept.
	 */
	static getAvailableModels(): string[] {
		const registryKeys = ModelRegistry.keysForCategory("image_to_video");
		return [
			...new Set([...registryKeys, ...Object.keys(LEGACY_MODEL_ALIASES)]),
		];
	}

	async initialize(): Promise<boolean> {
		this._hasFalKey = Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY);
		this._hasGmiKey = Boolean(process.env.GMI_API_KEY);
		this._hasImaRouterKey = Boolean(process.env.IMAROUTER_API_KEY);
		if (!this._hasFalKey && !this._hasGmiKey && !this._hasImaRouterKey) {
			console.warn(
				"[vimax.video] No FAL_KEY/GMI_API_KEY/IMAROUTER_API_KEY set — using mock mode"
			);
		}
		return true;
	}

	/** True if the adapter can make a real call for the given provider. */
	private _hasKeyFor(provider: VideoProviderBackend): boolean {
		if (provider === "gmi") return this._hasGmiKey;
		if (provider === "imarouter") return this._hasImaRouterKey;
		return this._hasFalKey;
	}

	async execute(input: Record<string, unknown>): Promise<VideoOutput> {
		return this.generate(
			input.image_path as string,
			input.prompt as string,
			input
		);
	}

	/**
	 * Generate a video from an image and prompt via the provider the
	 * registry assigns to `options.model`. Throws on unknown model keys
	 * (no silent Kling fallback). Falls back to mock output when the
	 * matching provider's API key isn't set.
	 */
	async generate(
		imagePath: string,
		prompt: string,
		options?: {
			model?: string;
			duration?: number;
			output_path?: string;
		}
	): Promise<VideoOutput> {
		await this.ensureInitialized();

		const model = options?.model ?? this.config.model;
		const duration = options?.duration ?? this.config.duration;

		// Registry lookup — throws early on typos / unregistered keys so
		// misconfiguration fails loudly instead of silently routing to FAL.
		const spec = resolveVideoModelSpec(model);

		if (!this._hasKeyFor(spec.providerBackend)) {
			console.warn(
				`[vimax.video] ${spec.providerBackend.toUpperCase()}_API_KEY not set — using mock mode for ${model}`
			);
			return this._mockGenerate(
				imagePath,
				prompt,
				model,
				duration,
				options?.output_path
			);
		}

		const startTime = Date.now();
		// Provider-specific image field; Seedance I2V is the odd GMI model
		// that requires `first_frame` instead of the generic `image`.
		const imageField = buildImageField({
			imagePath,
			provider: spec.providerBackend,
			modelKey: spec.canonicalKey,
		});
		const payload: Record<string, unknown> = {
			...spec.defaults,
			prompt,
			...imageField,
			duration: buildDurationField({ duration, spec }),
		};

		// Wrap the call in a retry loop — GMI's upstream video providers
		// (Kling, Veo) regularly return 500/timeout on busy periods; a
		// bounded retry with backoff dramatically improves reliability.
		// 4xx errors are surfaced immediately (they won't self-heal).
		const result = await callVideoApiWithRetry(() =>
			callModelApi({
				endpoint: spec.endpoint,
				payload,
				provider: spec.providerBackend,
				modelKey: spec.canonicalKey,
				onProgress: (percent, message) => {
					console.log(
						`[vimax.video] ${spec.canonicalKey}: ${percent}% ${message}`
					);
				},
			})
		);

		const generationTime = (Date.now() - startTime) / 1000;

		if (!result.success) {
			throw new Error(`Video generation failed: ${result.error}`);
		}

		const videoPath = options?.output_path ?? this._defaultOutputPath(model);
		this._ensureDir(videoPath);

		if (result.outputUrl) {
			await downloadOutput(result.outputUrl, videoPath);
		}

		return createVideoOutput({
			video_path: videoPath,
			video_url: result.outputUrl,
			source_image: imagePath,
			prompt,
			model,
			duration,
			width: 1280,
			height: 720,
			fps: this.config.fps,
			generation_time: generationTime,
			cost: spec.costPerSecond * duration,
		});
	}

	/** Generate videos from multiple images. */
	async generateFromImages(
		images: Array<ImageOutput | string>,
		prompts: string[],
		options?: { model?: string }
	): Promise<VideoOutput[]> {
		if (images.length !== prompts.length) {
			throw new Error("Number of images must match number of prompts");
		}

		const results: VideoOutput[] = [];
		for (let i = 0; i < images.length; i++) {
			const img = images[i];
			const imagePath = typeof img === "string" ? img : img.image_path;
			const result = await this.generate(imagePath, prompts[i], {
				model: options?.model,
			});
			results.push(result);
		}
		return results;
	}

	/** Concatenate multiple videos into one using FFmpeg. */
	async concatenateVideos(
		videos: VideoOutput[],
		outputPath: string
	): Promise<VideoOutput> {
		this._ensureDir(outputPath);

		const concatFile = path.join(path.dirname(outputPath), "concat_list.txt");
		const concatContent = videos
			.map((v) => `file '${v.video_path.replace(/\\/g, "/")}'`)
			.join("\n");
		fs.writeFileSync(concatFile, concatContent);

		try {
			await execFileAsync("ffmpeg", [
				"-y",
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatFile,
				"-c",
				"copy",
				outputPath,
			]);
		} catch (err) {
			console.warn(
				`[vimax.video] FFmpeg concat may have failed: ${err instanceof Error ? err.message : err}`
			);
			// Create placeholder if ffmpeg failed
			fs.writeFileSync(outputPath, "Concatenated video placeholder");
		} finally {
			if (fs.existsSync(concatFile)) {
				fs.unlinkSync(concatFile);
			}
		}

		const totalDuration = videos.reduce((sum, v) => sum + v.duration, 0);
		const totalCost = videos.reduce((sum, v) => sum + v.cost, 0);

		return createVideoOutput({
			video_path: outputPath,
			duration: totalDuration,
			cost: totalCost,
			metadata: { source_videos: videos.map((v) => v.video_path) },
		});
	}

	// -- Private helpers --

	private _defaultOutputPath(prefix: string): string {
		return path.join(this.config.output_dir, `${prefix}_${Date.now()}.mp4`);
	}

	private _ensureDir(filePath: string): void {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	private _mockGenerate(
		imagePath: string,
		prompt: string,
		model: string,
		duration: number,
		outputPath?: string
	): VideoOutput {
		const videoPath = outputPath ?? this._defaultOutputPath(`mock_${model}`);
		this._ensureDir(videoPath);
		fs.writeFileSync(videoPath, `Mock video: ${prompt}`);

		return createVideoOutput({
			video_path: videoPath,
			source_image: imagePath,
			prompt,
			model,
			duration,
			width: 1280,
			height: 720,
			fps: 24,
			generation_time: 0.1,
			cost: 0,
			metadata: { mock: true },
		});
	}
}

/**
 * Convenience function for quick single video generation.
 * Creates a temporary adapter, generates one video, and returns the result.
 */
export async function generateVideo(
	imagePath: string,
	prompt: string,
	options?: {
		model?: string;
		duration?: number;
		output_path?: string;
	}
): Promise<VideoOutput> {
	const adapter = new VideoGeneratorAdapter({ model: options?.model });
	return adapter.generate(imagePath, prompt, options);
}
