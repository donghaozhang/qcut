import {
	platform,
	type PlatformHyperframesAPI,
	type PlatformHyperframesRenderProgress,
} from "@qcut/platform-core";
import type { MediaItem } from "@/stores/media/media-store";
import type {
	HyperframesElement,
	MediaElement,
	TimelineElement,
	TimelineTrack,
} from "@/types/timeline";

const MAX_RENDER_DIMENSION = 4096;
const MAX_CONCURRENT_RENDERS = 2;

interface HyperframesRenderJob {
	key: string;
	renderId: string;
	element: HyperframesElement;
	width: number;
	height: number;
	fps: number;
}

interface CompletedHyperframesRender {
	job: HyperframesRenderJob;
	outputPath: string;
	outputUrl: string;
	sessionId: string;
	mediaId: string;
	duration: number;
}

export interface HyperframesExportPreparation {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	renderedElementCount: number;
}

export interface HyperframesExportController {
	render: (job: HyperframesRenderJob) => Promise<CompletedHyperframesRender>;
	cancel: () => Promise<void>;
	cleanup: () => Promise<void>;
	onProgress: (
		callback: (progress: PlatformHyperframesRenderProgress) => void
	) => () => void;
	isCancelled: () => boolean;
}

export class HyperframesExportCancelledError extends Error {
	constructor() {
		super("HyperFrames export preparation cancelled.");
		this.name = "HyperframesExportCancelledError";
	}
}

function stableVariables(
	variables: HyperframesElement["variableValues"]
): string {
	return JSON.stringify(
		Object.fromEntries(
			Object.entries(variables).sort(([left], [right]) =>
				left.localeCompare(right)
			)
		)
	);
}

function evenDimension(value: number): number {
	const rounded = Math.max(2, Math.round(value));
	return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function fitHyperframesRenderDimensions({
	sourceWidth,
	sourceHeight,
	maxWidth,
	maxHeight,
}: {
	sourceWidth: number;
	sourceHeight: number;
	maxWidth: number;
	maxHeight: number;
}): { width: number; height: number } {
	const safeSourceWidth =
		Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1;
	const safeSourceHeight =
		Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1;
	const safeMaxWidth =
		Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : safeSourceWidth;
	const safeMaxHeight =
		Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : safeSourceHeight;
	const scale = Math.min(
		1,
		safeMaxWidth / safeSourceWidth,
		safeMaxHeight / safeSourceHeight,
		MAX_RENDER_DIMENSION / safeSourceWidth,
		MAX_RENDER_DIMENSION / safeSourceHeight
	);
	return {
		width: evenDimension(safeSourceWidth * scale),
		height: evenDimension(safeSourceHeight * scale),
	};
}

function getRenderJobKey({
	element,
	width,
	height,
	fps,
}: {
	element: HyperframesElement;
	width: number;
	height: number;
	fps: number;
}): string {
	return [
		element.sourcePath,
		element.duration,
		width,
		height,
		fps,
		stableVariables(element.variableValues),
	].join("\u0000");
}

function createRenderJobs({
	tracks,
	frameRate,
	maxWidth,
	maxHeight,
	createId,
}: {
	tracks: TimelineTrack[];
	frameRate: number;
	maxWidth: number;
	maxHeight: number;
	createId: () => string;
}): {
	jobs: HyperframesRenderJob[];
	jobKeyByElementId: Map<string, string>;
} {
	const jobsByKey = new Map<string, HyperframesRenderJob>();
	const jobKeyByElementId = new Map<string, string>();

	for (const track of tracks) {
		if (track.type !== "hyperframes" || track.hidden) continue;
		for (const element of track.elements) {
			if (element.type !== "hyperframes" || element.hidden) continue;
			const dimensions = fitHyperframesRenderDimensions({
				sourceWidth: element.compositionWidth,
				sourceHeight: element.compositionHeight,
				maxWidth,
				maxHeight,
			});
			const key = getRenderJobKey({
				element,
				width: dimensions.width,
				height: dimensions.height,
				fps: frameRate,
			});
			jobKeyByElementId.set(element.id, key);
			if (jobsByKey.has(key)) continue;
			jobsByKey.set(key, {
				key,
				renderId: `hyperframes-${createId()}`,
				element,
				width: dimensions.width,
				height: dimensions.height,
				fps: frameRate,
			});
		}
	}

	return {
		jobs: Array.from(jobsByKey.values()),
		jobKeyByElementId,
	};
}

function toMediaElement({
	element,
	mediaId,
	duration,
}: {
	element: HyperframesElement;
	mediaId: string;
	duration: number;
}): MediaElement {
	const trimStart = Math.min(Math.max(0, element.trimStart), duration);
	const trimEnd = Math.min(
		Math.max(0, element.trimEnd),
		Math.max(0, duration - trimStart)
	);
	const mediaElement: MediaElement = {
		id: element.id,
		type: "media",
		mediaId,
		name: element.name,
		duration,
		startTime: element.startTime,
		trimStart,
		trimEnd,
		hidden: element.hidden,
		x: element.x,
		y: element.y,
		width: element.width,
		height: element.height,
		rotation: element.rotation,
		effects: element.effects,
		effectChains: element.effectChains,
		effectIds: element.effectIds,
		colorLabel: element.colorLabel,
		opacity: element.opacity ?? 1,
		scaleX: element.scale ?? 1,
		scaleY: element.scale ?? 1,
		maintainAspectRatio: true,
		fitMode: "contain",
		volume: 1,
	};
	return mediaElement;
}

function toMediaItem({
	completed,
}: {
	completed: CompletedHyperframesRender;
}): MediaItem {
	const filename =
		completed.outputPath.split(/[\\/]/).at(-1) || "hyperframes.mov";
	return {
		id: completed.mediaId,
		name: `${completed.job.element.name} (HyperFrames render)`,
		type: "video",
		file: new File([], filename, {
			type: "video/quicktime",
			lastModified: Date.now(),
		}),
		url: completed.outputUrl,
		localPath: completed.outputPath,
		isLocalFile: true,
		duration: completed.duration,
		width: completed.job.width,
		height: completed.job.height,
		fps: completed.job.fps,
		ephemeral: true,
		metadata: {
			source: "hyperframes",
			compositionId: completed.job.element.compositionId,
		},
	};
}

function replaceHyperframesTracks({
	tracks,
	completedByKey,
	jobKeyByElementId,
}: {
	tracks: TimelineTrack[];
	completedByKey: Map<string, CompletedHyperframesRender>;
	jobKeyByElementId: Map<string, string>;
}): TimelineTrack[] {
	return tracks.map((track) => {
		if (track.type !== "hyperframes") return track;
		const elements = track.elements.flatMap((element): TimelineElement[] => {
			if (element.type !== "hyperframes" || element.hidden || track.hidden) {
				return [];
			}
			const jobKey = jobKeyByElementId.get(element.id);
			const completed = jobKey ? completedByKey.get(jobKey) : undefined;
			if (!completed) {
				throw new Error(
					`Missing HyperFrames render for timeline element "${element.name}".`
				);
			}
			return [
				toMediaElement({
					element,
					mediaId: completed.mediaId,
					duration: completed.duration,
				}),
			];
		});

		return {
			...track,
			type: "media",
			name: `${track.name} (HyperFrames)`,
			elements,
		};
	});
}

export function hasExportableHyperframes({
	tracks,
}: {
	tracks: TimelineTrack[];
}): boolean {
	return tracks.some(
		(track) =>
			track.type === "hyperframes" &&
			!track.hidden &&
			track.elements.some(
				(element) => element.type === "hyperframes" && !element.hidden
			)
	);
}

export function createHyperframesExportController({
	api = platform().hyperframes,
	createId = () => crypto.randomUUID(),
}: {
	api?: PlatformHyperframesAPI;
	createId?: () => string;
} = {}): HyperframesExportController {
	const activeRenderIds = new Set<string>();
	const sessionIds = new Set<string>();
	let cancelled = false;

	return {
		render: async (job) => {
			if (cancelled) throw new HyperframesExportCancelledError();
			activeRenderIds.add(job.renderId);
			try {
				const result = await api.render({
					renderId: job.renderId,
					elementId: job.element.id,
					sourcePath: job.element.sourcePath,
					variables: job.element.variableValues,
					width: job.width,
					height: job.height,
					fps: job.fps,
					duration: job.element.duration,
				});
				if (result.sessionId) {
					sessionIds.add(result.sessionId);
				}
				if (cancelled) {
					if (result.sessionId) {
						await api.cleanup(result.sessionId);
						sessionIds.delete(result.sessionId);
					}
					throw new HyperframesExportCancelledError();
				}
				if (
					!result.success ||
					!result.outputPath ||
					!result.outputUrl ||
					!result.sessionId
				) {
					throw new Error(
						result.error ||
							`HyperFrames render failed for "${job.element.name}".`
					);
				}
				return {
					job,
					outputPath: result.outputPath,
					outputUrl: result.outputUrl,
					sessionId: result.sessionId,
					mediaId: `hyperframes-media-${createId()}`,
					duration:
						typeof result.duration === "number" &&
						Number.isFinite(result.duration) &&
						result.duration > 0
							? result.duration
							: job.element.duration,
				};
			} finally {
				activeRenderIds.delete(job.renderId);
			}
		},
		cancel: async () => {
			cancelled = true;
			await Promise.allSettled(
				Array.from(activeRenderIds, (renderId) => api.cancel(renderId))
			);
		},
		cleanup: async () => {
			cancelled = true;
			await Promise.allSettled(
				Array.from(activeRenderIds, (renderId) => api.cancel(renderId))
			);
			await Promise.allSettled(
				Array.from(sessionIds, (sessionId) => api.cleanup(sessionId))
			);
			sessionIds.clear();
		},
		onProgress: (callback) => api.onRenderProgress(callback),
		isCancelled: () => cancelled,
	};
}

async function runRenderJobs({
	jobs,
	controller,
	onProgress,
}: {
	jobs: HyperframesRenderJob[];
	controller: HyperframesExportController;
	onProgress?: (progress: number, status: string) => void;
}): Promise<CompletedHyperframesRender[]> {
	if (jobs.length === 0) return [];

	const progressByRenderId = new Map<string, number>(
		jobs.map((job) => [job.renderId, 0])
	);
	const reportProgress = ({ status }: { status: string }) => {
		const total = Array.from(progressByRenderId.values()).reduce(
			(sum, value) => sum + value,
			0
		);
		onProgress?.(total / jobs.length, status);
	};
	const unsubscribe = controller.onProgress((progress) => {
		if (!progressByRenderId.has(progress.renderId)) return;
		progressByRenderId.set(
			progress.renderId,
			Math.max(0, Math.min(100, progress.progress))
		);
		reportProgress({
			status: `Rendering HyperFrames (${progress.frame}/${progress.totalFrames})...`,
		});
	});

	let nextJobIndex = 0;
	const completed: CompletedHyperframesRender[] = [];
	const worker = async (): Promise<void> => {
		const jobIndex = nextJobIndex;
		nextJobIndex += 1;
		const job = jobs[jobIndex];
		if (!job) return;
		if (controller.isCancelled()) {
			throw new HyperframesExportCancelledError();
		}
		const result = await controller.render(job);
		completed.push(result);
		progressByRenderId.set(job.renderId, 100);
		reportProgress({
			status: `Prepared ${completed.length}/${jobs.length} HyperFrames composition${jobs.length === 1 ? "" : "s"}`,
		});
		return worker();
	};

	try {
		const workerCount = Math.min(MAX_CONCURRENT_RENDERS, jobs.length);
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
		return completed;
	} finally {
		unsubscribe();
	}
}

/** Pre-render HyperFrames elements and expose them as ephemeral media clips. */
export async function prepareHyperframesForExport({
	tracks,
	mediaItems,
	frameRate,
	resolution,
	controller,
	onProgress,
	createId = () => crypto.randomUUID(),
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	frameRate: number;
	resolution: { width: number; height: number };
	controller: HyperframesExportController;
	onProgress?: (progress: number, status: string) => void;
	createId?: () => string;
}): Promise<HyperframesExportPreparation> {
	if (!hasExportableHyperframes({ tracks })) {
		return { tracks, mediaItems, renderedElementCount: 0 };
	}
	const { jobs, jobKeyByElementId } = createRenderJobs({
		tracks,
		frameRate,
		maxWidth: resolution.width,
		maxHeight: resolution.height,
		createId,
	});
	const completed = await runRenderJobs({
		jobs,
		controller,
		onProgress,
	});
	const completedByKey = new Map(
		completed.map((item) => [item.job.key, item] as const)
	);
	const renderedMediaItems = completed.map((item) =>
		toMediaItem({ completed: item })
	);

	return {
		tracks: replaceHyperframesTracks({
			tracks,
			completedByKey,
			jobKeyByElementId,
		}),
		mediaItems: [...mediaItems, ...renderedMediaItems],
		renderedElementCount: jobKeyByElementId.size,
	};
}
