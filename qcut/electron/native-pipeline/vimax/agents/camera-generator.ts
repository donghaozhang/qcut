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
import type {
	ImageOutput,
	VideoOutput,
	PipelineOutput,
} from "../types/output.js";
import { createPipelineOutput, addVideoToOutput } from "../types/output.js";

export interface CameraGeneratorConfig extends AgentConfig {
	video_model: string;
	default_duration: number;
	output_dir: string;
}

export function createCameraGeneratorConfig(
	partial?: Partial<CameraGeneratorConfig>
): CameraGeneratorConfig {
	return {
		...createAgentConfig({ name: "CameraImageGenerator" }),
		video_model: "kling",
		default_duration: 5.0,
		output_dir: "media/generated/vimax/videos",
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
		storyboard: StoryboardResult
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

			// Match images with shots
			let imageIndex = 0;
			for (const scene of storyboard.scenes) {
				for (const shot of scene.shots) {
					if (imageIndex >= storyboard.images.length) break;

					const image = storyboard.images[imageIndex];
					imageIndex++;

					const motionPrompt = this._getMotionPrompt(shot);
					const outputPath = path.join(outputDir, `${shot.shot_id}.mp4`);

					const video = await this._videoAdapter!.generate(
						image.image_path,
						motionPrompt,
						{
							duration: shot.duration_seconds || this.config.default_duration,
							output_path: outputPath,
						}
					);

					addVideoToOutput(output, video);
				}
			}

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
			const video = await this._videoAdapter!.generate(
				images[i].image_path,
				prompts[i],
				{ duration: durs[i] }
			);
			videos.push(video);
		}

		return videos;
	}
}
