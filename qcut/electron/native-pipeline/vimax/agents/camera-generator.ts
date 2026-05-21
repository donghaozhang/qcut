/**
 * Camera Image Generator Agent
 *
 * Generates videos from storyboard images, applying camera movements
 * and animations based on shot descriptions.
 *
 * Ported from: vimax/agents/camera_generator.py
 */

import * as path from "path";
import * as fs from "fs";
import {
	BaseAgent,
	type AgentConfig,
	type AgentResult,
	createAgentConfig,
	agentOk,
	agentFail,
} from "./base-agent.js";
import type { StoryboardResult } from "./storyboard-artist.js";
import { VideoGeneratorAdapter } from "../adapters/video-adapter.js";
import type { ShotDescription } from "../types/shot.js";
import type { CharacterPortraitRegistry } from "../types/character.js";
import type {
	ImageOutput,
	VideoOutput,
	PipelineOutput,
} from "../types/output.js";
import { createPipelineOutput, addVideoToOutput } from "../types/output.js";

export type VideoReferenceMode =
	| "storyboard"
	| "references"
	| "storyboard+references";

export interface CameraGeneratorConfig extends AgentConfig {
	video_model: string;
	default_duration: number;
	output_dir: string;
	video_reference_mode: VideoReferenceMode;
	video_reference_images: string[];
	max_video_references: number;
}

export function createCameraGeneratorConfig(
	partial?: Partial<CameraGeneratorConfig>
): CameraGeneratorConfig {
	return {
		...createAgentConfig({ name: "CameraImageGenerator" }),
		video_model: "kling",
		default_duration: 5.0,
		output_dir: "media/generated/vimax/videos",
		video_reference_mode: "storyboard+references",
		video_reference_images: [],
		max_video_references: 14,
		...partial,
	};
}

/** Camera movement → motion prompt hints. */
const MOVEMENT_HINTS: Record<string, string> = {
	pan: "smooth horizontal camera pan",
	tilt: "smooth vertical camera tilt",
	zoom: "gradual zoom",
	dolly: "camera moving forward/backward",
	tracking: "camera tracking subject movement",
	static: "subtle ambient motion, no camera movement",
};

interface VideoReferenceAuditEntry {
	shot_id: string;
	video_path?: string;
	source_image: string;
	video_reference_mode: VideoReferenceMode;
	include_source_image: boolean;
	reference_image_count: number;
	reference_images: string[];
	error?: string;
}

function uniqueReferences(references: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const reference of references) {
		const trimmed = reference?.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		unique.push(trimmed);
	}
	return unique;
}

export function collectVideoReferenceImages({
	shot,
	portraitRegistry,
	extraReferenceImages = [],
	maxReferences = 14,
}: {
	shot: ShotDescription;
	portraitRegistry?: CharacterPortraitRegistry;
	extraReferenceImages?: string[];
	maxReferences?: number;
}): string[] {
	const registryReferences =
		portraitRegistry && shot.characters.length > 0
			? shot.characters.map((character) =>
					portraitRegistry.getBestView(character, shot.camera_angle)
				)
			: [];
	return uniqueReferences([
		shot.primary_reference_image,
		...Object.values(shot.character_references ?? {}),
		...registryReferences,
		...extraReferenceImages,
	]).slice(0, Math.max(0, maxReferences));
}

export class CameraImageGenerator extends BaseAgent<
	StoryboardResult,
	PipelineOutput
> {
	declare config: CameraGeneratorConfig;
	private _videoAdapter: VideoGeneratorAdapter | null = null;

	constructor(config?: Partial<CameraGeneratorConfig>) {
		super(createCameraGeneratorConfig(config));
	}

	private async _ensureAdapter(): Promise<void> {
		if (!this._videoAdapter) {
			this._videoAdapter = new VideoGeneratorAdapter({
				model: this.config.video_model,
				output_dir: this.config.output_dir,
			});
			await this._videoAdapter.initialize();
		}
	}

	/** Generate motion prompt from shot description. */
	private _getMotionPrompt(shot: ShotDescription): string {
		const parts: string[] = [];

		parts.push(shot.description);

		const movement =
			typeof shot.camera_movement === "string"
				? shot.camera_movement
				: shot.camera_movement;

		if (movement in MOVEMENT_HINTS) {
			parts.push(MOVEMENT_HINTS[movement]);
		}

		return parts.join(", ");
	}

	async process(
		storyboard: StoryboardResult,
		portraitRegistry?: CharacterPortraitRegistry
	): Promise<AgentResult<PipelineOutput>> {
		await this._ensureAdapter();

		console.log(`[camera_gen] Generating videos for: ${storyboard.title}`);

		try {
			const output = createPipelineOutput({
				pipeline_name: `camera_generator_${storyboard.title}`,
				output_directory: this.config.output_dir,
			});

			const safeTitle = storyboard.title.replace(/\s+/g, "_");
			const outputDir = path.join(this.config.output_dir, safeTitle);
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			const referenceAudit: VideoReferenceAuditEntry[] = [];
			// Match images with shots
			let imageIndex = 0;
			for (const scene of storyboard.scenes) {
				for (const shot of scene.shots) {
					if (imageIndex >= storyboard.images.length) break;

					const image = storyboard.images[imageIndex];
					imageIndex++;

					const motionPrompt = this._getMotionPrompt(shot);
					const outputPath = path.join(outputDir, `${shot.shot_id}.mp4`);
					const sourceImage = image.image_url ?? image.image_path;
					const referenceImages = collectVideoReferenceImages({
						shot,
						portraitRegistry,
						extraReferenceImages: this.config.video_reference_images,
						maxReferences: this.config.max_video_references,
					});
					const includeSourceImage =
						this.config.video_reference_mode !== "references" ||
						referenceImages.length === 0;
					const videoReferenceImages =
						this.config.video_reference_mode === "storyboard"
							? []
							: referenceImages;
					console.log(
						`[camera_gen] ${shot.shot_id}: video refs=${videoReferenceImages.length}, storyboard=${includeSourceImage ? "yes" : "no"}`
					);

					try {
						const video = await this._videoAdapter!.generate(
							sourceImage,
							motionPrompt,
							{
								duration: shot.duration_seconds || this.config.default_duration,
								output_path: outputPath,
								reference_images: videoReferenceImages,
								include_source_image: includeSourceImage,
							}
						);
						video.metadata = {
							...video.metadata,
							video_reference_mode: this.config.video_reference_mode,
							include_source_image: includeSourceImage,
							reference_image_count: videoReferenceImages.length,
							reference_images: videoReferenceImages,
						};
						referenceAudit.push({
							shot_id: shot.shot_id,
							video_path: video.video_path,
							source_image: sourceImage,
							video_reference_mode: this.config.video_reference_mode,
							include_source_image: includeSourceImage,
							reference_image_count: videoReferenceImages.length,
							reference_images: videoReferenceImages,
						});
						addVideoToOutput(output, video);
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						const shotError = `${shot.shot_id}: ${msg}`;
						console.error(`[camera_gen] Shot failed: ${shotError}`);
						output.errors.push(shotError);
						referenceAudit.push({
							shot_id: shot.shot_id,
							source_image: sourceImage,
							video_reference_mode: this.config.video_reference_mode,
							include_source_image: includeSourceImage,
							reference_image_count: videoReferenceImages.length,
							reference_images: videoReferenceImages,
							error: msg,
						});
					}
				}
			}

			fs.writeFileSync(
				path.join(outputDir, "video_reference_audit.json"),
				`${JSON.stringify(referenceAudit, null, 2)}\n`
			);

			// Concatenate all videos
			if (output.videos.length > 0) {
				const finalPath = path.join(outputDir, "final_video.mp4");
				const finalVideo = await this._videoAdapter!.concatenateVideos(
					output.videos,
					finalPath
				);
				output.final_video = finalVideo;
			}

			output.completed_at = new Date().toISOString();

			const finalDuration = output.final_video?.duration ?? 0;
			console.log(
				`[camera_gen] Generated ${output.videos.length} videos, final: ${finalDuration.toFixed(1)}s`
			);

			return agentOk(output, {
				video_count: output.videos.length,
				total_duration: finalDuration,
				cost: output.total_cost,
				errors: output.errors,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[camera_gen] Failed: ${msg}`);
			return agentFail(msg);
		}
	}

	/** Generate videos from images with prompts. */
	async generateFromImages(
		images: ImageOutput[],
		prompts: string[],
		durations?: number[]
	): Promise<VideoOutput[]> {
		await this._ensureAdapter();

		if (images.length !== prompts.length) {
			throw new Error("Number of images must match number of prompts");
		}

		const durs =
			durations ?? new Array(images.length).fill(this.config.default_duration);
		const videos: VideoOutput[] = [];

		for (let i = 0; i < images.length; i++) {
			const sourceImage = images[i].image_url ?? images[i].image_path;
			const video = await this._videoAdapter!.generate(
				sourceImage,
				prompts[i],
				{ duration: durs[i] }
			);
			videos.push(video);
		}

		return videos;
	}
}
