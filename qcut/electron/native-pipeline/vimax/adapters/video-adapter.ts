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

interface ResolvedModelSpec {
	/** The canonical registry key (after alias resolution). */
	canonicalKey: string;
	/** Provider-specific endpoint path (e.g. "fal-ai/kling-video/v2.1/…"). */
	endpoint: string;
	/** Which backend `callModelApi` should use. */
	providerBackend: "fal" | "gmi";
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
		providerBackend: (def.providerBackend as "fal" | "gmi") ?? "fal",
		costPerSecond: extractCostPerSecond(def.pricing),
	};
}

/**
 * Build the provider-specific image payload field.
 *
 *   - FAL's image-to-video endpoints take `image_url` and accept remote
 *     URLs or data URIs directly.
 *   - GMI's endpoints take `image` and accept remote URLs or raw base64
 *     strings (no `data:…;base64,` prefix — matches the payload shape in
 *     `cli-handlers-element.ts` and `gmi-image-to-video.ts`).
 *
 * Local filesystem paths are read from disk and encoded accordingly.
 */
export function buildImageField(
	imagePath: string,
	provider: "fal" | "gmi"
): Record<string, string> {
	const isRemote = /^https?:/i.test(imagePath);
	const isDataUri = imagePath.startsWith("data:");

	if (provider === "gmi") {
		if (isRemote || isDataUri) {
			return { image: imagePath };
		}
		// Local file — encode to raw base64 (GMI's documented format).
		return { image: fs.readFileSync(imagePath).toString("base64") };
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
		if (!this._hasFalKey && !this._hasGmiKey) {
			console.warn(
				"[vimax.video] No FAL_KEY or GMI_API_KEY set — using mock mode"
			);
		}
		return true;
	}

	/** True if the adapter can make a real call for the given provider. */
	private _hasKeyFor(provider: "fal" | "gmi"): boolean {
		return provider === "gmi" ? this._hasGmiKey : this._hasFalKey;
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
		// Provider-specific payload shape — FAL expects `image_url` with
		// either a remote URL or a data URI, while GMI expects `image` with
		// a raw base64 string (no `data:…` prefix). Matches the working
		// payloads used elsewhere in the codebase (gmi-image-to-video.ts /
		// cli-handlers-element.ts).
		const imageField = buildImageField(imagePath, spec.providerBackend);
		const payload: Record<string, unknown> = {
			prompt,
			...imageField,
			duration: String(Math.round(duration)),
		};

		const result = await callModelApi({
			endpoint: spec.endpoint,
			payload,
			provider: spec.providerBackend,
			modelKey: spec.canonicalKey,
		});

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
