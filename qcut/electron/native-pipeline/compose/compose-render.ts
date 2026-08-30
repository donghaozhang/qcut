import { randomUUID } from "node:crypto";
import {
	copyFile,
	mkdir,
	mkdtemp,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { materializeSticker } from "../stickers/sticker-asset-materializer.js";
import { probeFilterLabMedia } from "../filters/filter-lab-media.js";
import { renderFilterLabPipelineMedia } from "../filters/filter-lab-pipeline-render.js";
import {
	buildComposeFinishingArgs,
	buildComposeNormalizeArgs,
	buildComposeTimelineArgs,
	runComposeFfmpeg,
	type ComposeTimelineClip,
	type MaterializedComposeOverlay,
} from "./compose-ffmpeg.js";
import {
	probeComposeMedia,
	type ResolvedComposeClip,
	type ResolvedComposeProject,
} from "./compose-resolver.js";

export interface ComposeRenderProgress {
	stage: string;
	percent: number;
	message: string;
}

export interface ComposeRenderResult {
	outputPath: string;
	lockPath: string;
	reportPath: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
	report: {
		kind: "qcut-compose-render-report-v1";
		config: string;
		output: string;
		expectedDuration: number;
		actualDuration: number;
		clipCount: number;
		filterCount: number;
		transitionCount: number;
		stickerCount: number;
		soundEffectCount: number;
		parallelClipPreparation: boolean;
		encodingPasses: {
			clipNormalization: number;
			filterPipeline: number;
			timelineVideo: number;
			timelineAudio: number;
			finishing: number;
		};
		stageSeconds: {
			clipPreparation: number;
			timeline: number;
			finishing: number;
			total: number;
		};
	};
}

export interface ComposeRenderDependencies {
	runFfmpeg: typeof runComposeFfmpeg;
	probeMedia: typeof probeComposeMedia;
	probeFilterMedia: typeof probeFilterLabMedia;
	renderFilters: typeof renderFilterLabPipelineMedia;
	materialize: typeof materializeSticker;
}

function elapsedSeconds({ startedAt }: { startedAt: number }): number {
	return Number(((Date.now() - startedAt) / 1000).toFixed(3));
}

async function publishStagedFile({
	stagedPath,
	outputPath,
	force,
}: {
	stagedPath: string;
	outputPath: string;
	force: boolean;
}): Promise<void> {
	const backupPath = `${outputPath}.backup-${randomUUID()}`;
	let movedExisting = false;
	try {
		if (force) {
			try {
				await rename(outputPath, backupPath);
				movedExisting = true;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "ENOENT") throw error;
			}
		}
		await rename(stagedPath, outputPath);
		if (movedExisting) await rm(backupPath, { force: true });
	} catch (error) {
		if (movedExisting) {
			try {
				await rename(backupPath, outputPath);
			} catch {
				// Keep the original error; the backup remains beside the requested output.
			}
		}
		throw error;
	}
}

async function prepareClip({
	item,
	index,
	directory,
	resolved,
	signal,
	dependencies,
}: {
	item: ResolvedComposeClip;
	index: number;
	directory: string;
	resolved: ResolvedComposeProject;
	signal: AbortSignal;
	dependencies: ComposeRenderDependencies;
}): Promise<ComposeTimelineClip> {
	const prefix = `${String(index + 1).padStart(2, "0")}-${item.clip.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
	const normalizedPath = join(directory, `${prefix}-normalized.mp4`);
	await dependencies.runFfmpeg({
		args: buildComposeNormalizeArgs({
			input: item.sourcePath,
			output: normalizedPath,
			trimIn: item.clip.trim.in,
			duration: item.duration,
			width: resolved.loaded.manifest.canvas.width,
			height: resolved.loaded.manifest.canvas.height,
			fps: resolved.loaded.manifest.canvas.fps,
			hasAudio: item.media.hasAudio,
		}),
		signal,
	});
	if (item.filterPlans.length === 0) {
		return { path: normalizedPath, duration: item.duration };
	}
	const filteredPath = join(directory, `${prefix}-filtered.mp4`);
	const normalizedMedia = await dependencies.probeFilterMedia({
		filePath: normalizedPath,
		signal,
	});
	await dependencies.renderFilters({
		input: normalizedPath,
		output: filteredPath,
		isImage: false,
		media: normalizedMedia,
		plans: item.filterPlans,
		signal,
	});
	return { path: filteredPath, duration: item.duration };
}

async function materializeOverlays({
	resolved,
	directory,
	signal,
	dependencies,
}: {
	resolved: ResolvedComposeProject;
	directory: string;
	signal: AbortSignal;
	dependencies: ComposeRenderDependencies;
}): Promise<MaterializedComposeOverlay[]> {
	const outputDirectory = join(directory, "sticker-assets");
	await mkdir(outputDirectory, { recursive: true });
	return Promise.all(
		resolved.overlays.map(async ({ overlay, sourcePath }, index) => {
			const materialized = await dependencies.materialize({
				item: {
					source: sourcePath,
					startTime: overlay.start,
					duration: overlay.duration,
					x: 0,
					y: 0,
					width: Math.max(
						1,
						Math.round(
							resolved.loaded.manifest.canvas.width * overlay.transform.scale
						)
					),
					rotation: overlay.transform.rotation,
					opacity: overlay.opacity,
					fadeIn: overlay.fadeIn,
					fadeOut: overlay.fadeOut,
				},
				outputDirectory,
				index,
				planDirectory: resolved.loaded.configDirectory,
				signal,
			});
			return { overlay, path: materialized.path };
		})
	);
}

function reportPaths({ outputPath }: { outputPath: string }): {
	lockPath: string;
	reportPath: string;
} {
	const stem = basename(outputPath, extname(outputPath));
	return {
		lockPath: join(dirname(outputPath), `${stem}.compose-lock.json`),
		reportPath: join(dirname(outputPath), `${stem}.render-report.json`),
	};
}

export async function renderResolvedComposeProject({
	resolved,
	outputPath: requestedOutputPath,
	force,
	signal,
	onProgress = () => undefined,
	dependencies: dependencyOverrides = {},
}: {
	resolved: ResolvedComposeProject;
	outputPath: string;
	force: boolean;
	signal: AbortSignal;
	onProgress?: (progress: ComposeRenderProgress) => void;
	dependencies?: Partial<ComposeRenderDependencies>;
}): Promise<ComposeRenderResult> {
	const dependencies: ComposeRenderDependencies = {
		runFfmpeg: runComposeFfmpeg,
		probeMedia: probeComposeMedia,
		probeFilterMedia: probeFilterLabMedia,
		renderFilters: renderFilterLabPipelineMedia,
		materialize: materializeSticker,
		...dependencyOverrides,
	};
	const outputPath = resolve(requestedOutputPath);
	if (extname(outputPath).toLowerCase() !== ".mp4") {
		throw new Error("Compose output must use .mp4.");
	}
	const inputPaths = [
		...resolved.clips.map(({ sourcePath }) => sourcePath),
		...resolved.overlays.map(({ sourcePath }) => sourcePath),
		...resolved.audio.map(({ sourcePath }) => sourcePath),
	];
	if (inputPaths.includes(outputPath)) {
		throw new Error("Compose output cannot replace an input asset.");
	}
	if (!force) {
		try {
			await statOutput({ outputPath });
			throw new Error(
				`Output already exists: ${outputPath}. Pass --force to replace it.`
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	await mkdir(dirname(outputPath), { recursive: true });
	const temporaryDirectory = await mkdtemp(
		join(dirname(outputPath), ".qcut-compose-")
	);
	const totalStartedAt = Date.now();
	try {
		signal.throwIfAborted();
		onProgress({
			stage: "clips",
			percent: 10,
			message: `Preparing ${resolved.clips.length} clips in parallel...`,
		});
		const clipStartedAt = Date.now();
		const preparedClips = await Promise.all(
			resolved.clips.map((item, index) =>
				prepareClip({
					item,
					index,
					directory: temporaryDirectory,
					resolved,
					signal,
					dependencies,
				})
			)
		);
		const clipPreparationSeconds = elapsedSeconds({ startedAt: clipStartedAt });
		onProgress({
			stage: "timeline",
			percent: 55,
			message: "Joining clips and compiling transitions...",
		});
		const timelineStartedAt = Date.now();
		const timelinePath = join(temporaryDirectory, "timeline.mp4");
		if (preparedClips.length === 1) {
			await copyFile(preparedClips[0].path, timelinePath);
		} else {
			const timelineVideoPath = join(temporaryDirectory, "timeline-video.mp4");
			const timelineAudioPath = join(temporaryDirectory, "timeline-audio.m4a");
			const timeline = buildComposeTimelineArgs({
				clips: preparedClips,
				transitionsByCut: resolved.transitionsByCut,
				videoOutput: timelineVideoPath,
				audioOutput: timelineAudioPath,
				output: timelinePath,
			});
			await Promise.all([
				dependencies.runFfmpeg({ args: timeline.videoArgs, signal }),
				dependencies.runFfmpeg({ args: timeline.audioArgs, signal }),
			]);
			await dependencies.runFfmpeg({ args: timeline.muxArgs, signal });
		}
		const timelineSeconds = elapsedSeconds({ startedAt: timelineStartedAt });
		onProgress({
			stage: "finishing",
			percent: 75,
			message: "Rendering stickers and sound effects...",
		});
		const finishingStartedAt = Date.now();
		const stagedOutput = join(temporaryDirectory, "final.mp4");
		if (resolved.overlays.length > 0 || resolved.audio.length > 0) {
			const overlays = await materializeOverlays({
				resolved,
				directory: temporaryDirectory,
				signal,
				dependencies,
			});
			await dependencies.runFfmpeg({
				args: buildComposeFinishingArgs({
					input: timelinePath,
					output: stagedOutput,
					duration: resolved.duration,
					canvasWidth: resolved.loaded.manifest.canvas.width,
					canvasHeight: resolved.loaded.manifest.canvas.height,
					fps: resolved.loaded.manifest.canvas.fps,
					overlays,
					audio: resolved.audio,
				}),
				signal,
			});
		} else {
			await copyFile(timelinePath, stagedOutput);
		}
		const finishingSeconds = elapsedSeconds({ startedAt: finishingStartedAt });
		const outputMedia = await dependencies.probeMedia({
			filePath: stagedOutput,
			signal,
		});
		const canvas = resolved.loaded.manifest.canvas;
		if (
			!outputMedia.hasVideo ||
			!outputMedia.hasAudio ||
			outputMedia.width !== canvas.width ||
			outputMedia.height !== canvas.height ||
			Math.abs(outputMedia.frameRate - canvas.fps) > 0.01 ||
			Math.abs(outputMedia.duration - resolved.duration) > 0.35
		) {
			throw new Error(
				`Compose verification failed: ${outputMedia.width}x${outputMedia.height} at ${outputMedia.frameRate.toFixed(3)} fps, ${outputMedia.duration.toFixed(3)}s, audio=${outputMedia.hasAudio}.`
			);
		}
		await publishStagedFile({ stagedPath: stagedOutput, outputPath, force });
		const { lockPath, reportPath } = reportPaths({ outputPath });
		const filterCount = resolved.clips.reduce(
			(total, clip) => total + clip.filterPlans.length,
			0
		);
		const report: ComposeRenderResult["report"] = {
			kind: "qcut-compose-render-report-v1",
			config: resolved.loaded.configPath,
			output: outputPath,
			expectedDuration: resolved.duration,
			actualDuration: outputMedia.duration,
			clipCount: resolved.clips.length,
			filterCount,
			transitionCount: resolved.loaded.manifest.transitions.length,
			stickerCount: resolved.overlays.length,
			soundEffectCount: resolved.audio.length,
			parallelClipPreparation: resolved.clips.length > 1,
			encodingPasses: {
				clipNormalization: resolved.clips.length,
				filterPipeline: resolved.clips.filter(
					({ filterPlans }) => filterPlans.length > 0
				).length,
				timelineVideo: resolved.clips.length > 1 ? 1 : 0,
				timelineAudio: resolved.clips.length > 1 ? 1 : 0,
				finishing:
					resolved.overlays.length > 0 || resolved.audio.length > 0 ? 1 : 0,
			},
			stageSeconds: {
				clipPreparation: clipPreparationSeconds,
				timeline: timelineSeconds,
				finishing: finishingSeconds,
				total: elapsedSeconds({ startedAt: totalStartedAt }),
			},
		};
		await Promise.all([
			writeFile(lockPath, `${JSON.stringify(resolved.lock, null, 2)}\n`),
			writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
		]);
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Compose render complete",
		});
		return {
			outputPath,
			lockPath,
			reportPath,
			duration: outputMedia.duration,
			width: outputMedia.width,
			height: outputMedia.height,
			fps: outputMedia.frameRate,
			hasAudio: outputMedia.hasAudio,
			report,
		};
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

async function statOutput({
	outputPath,
}: {
	outputPath: string;
}): Promise<void> {
	const { stat } = await import("node:fs/promises");
	await stat(outputPath);
}
