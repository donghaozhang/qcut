import { promises as fs } from "node:fs";
import { basename, resolve } from "node:path";
import {
	detectSceneBoundaries,
	discoverVideoFiles,
	extractGrayscaleSamples,
	fingerprintFile,
	probeMedia,
} from "./media-process.js";
import {
	aggregateRangeMetrics,
	buildFrameSamples,
	scoreRangeMetrics,
} from "./visual-metrics.js";
import {
	MEDIA_INDEX_VERSION,
	type FrameSample,
	type IndexedMediaSource,
	type IndexedRange,
	type IndexedScene,
	type MediaIndex,
	type MediaProbe,
	type SemanticScene,
	type SourceSemantics,
} from "./types.js";

const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const MIN_SCENE_DURATION = 0.4;

interface IndexProgress {
	stage: string;
	percent: number;
	message: string;
	source?: string;
}

interface MediaIndexRequest {
	directory: string;
	outputDir: string;
	sampleFps: number;
	sceneThreshold: number;
	candidateDuration: number;
	recursive: boolean;
	semanticModel?: string;
	signal?: AbortSignal;
	onProgress?: (progress: IndexProgress) => void;
	analyzeSemantics?: (options: {
		path: string;
		probe: MediaProbe;
		sceneBoundaries: number[];
		signal: AbortSignal;
		onProgress: (percent: number, message: string) => void;
	}) => Promise<SourceSemantics>;
}

function round({
	value,
	digits = 3,
}: {
	value: number;
	digits?: number;
}): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function slug({ value }: { value: string }): string {
	return (
		value
			.toLowerCase()
			.replace(/\.[^.]+$/, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "source"
	);
}

function samplesInRange({
	samples,
	start,
	end,
}: {
	samples: FrameSample[];
	start: number;
	end: number;
}): FrameSample[] {
	const inside = samples.filter(
		(sample) => sample.time >= start && sample.time <= end
	);
	if (inside.length > 0) return inside;
	const nearest = [...samples].sort(
		(left, right) =>
			Math.abs(left.time - (start + end) / 2) -
			Math.abs(right.time - (start + end) / 2)
	)[0];
	return nearest ? [nearest] : [];
}

function describeRange({
	metrics,
}: {
	metrics: ReturnType<typeof aggregateRangeMetrics>;
}): string {
	const strengths: string[] = [];
	if (metrics.stability >= 0.72) strengths.push("stable composition");
	if (metrics.sharpness >= 0.62) strengths.push("high sharpness");
	if (metrics.exposure >= 0.75) strengths.push("balanced exposure");
	if (
		metrics.motionDirection !== "static" &&
		metrics.motionDirection !== "mixed"
	) {
		strengths.push(`smooth ${metrics.motionDirection} motion`);
	}
	return strengths.length > 0
		? strengths.join(", ")
		: "best available technical range";
}

function makeRange({
	id,
	start,
	end,
	samples,
}: {
	id: string;
	start: number;
	end: number;
	samples: FrameSample[];
}): IndexedRange {
	const rangeSamples = samplesInRange({ samples, start, end });
	const metrics = aggregateRangeMetrics({ samples: rangeSamples });
	return {
		id,
		start: round({ value: start }),
		end: round({ value: end }),
		duration: round({ value: end - start }),
		score: scoreRangeMetrics({ metrics }),
		metrics,
		reason: describeRange({ metrics }),
	};
}

function buildCandidateStarts({
	start,
	end,
	duration,
	step,
}: {
	start: number;
	end: number;
	duration: number;
	step: number;
}): number[] {
	if (end - start <= duration) return [start];
	const count = Math.max(1, Math.floor((end - start - duration) / step) + 1);
	const starts = Array.from({ length: count }, (_, index) =>
		round({ value: start + index * step })
	);
	const finalStart = round({ value: end - duration });
	if (Math.abs((starts[starts.length - 1] ?? start) - finalStart) > 0.05) {
		starts.push(finalStart);
	}
	return starts;
}

function selectNonOverlapping({
	ranges,
	limit,
}: {
	ranges: IndexedRange[];
	limit: number;
}): IndexedRange[] {
	const selected: IndexedRange[] = [];
	const sorted = [...ranges].sort(
		(left, right) => right.score - left.score || left.start - right.start
	);
	for (const range of sorted) {
		const overlaps = selected.some((existing) => {
			const overlap =
				Math.min(existing.end, range.end) -
				Math.max(existing.start, range.start);
			return overlap > Math.min(existing.duration, range.duration) * 0.5;
		});
		if (!overlaps) selected.push(range);
		if (selected.length >= limit) break;
	}
	return selected.sort((left, right) => left.start - right.start);
}

function buildSceneRanges({
	sceneId,
	start,
	end,
	samples,
	candidateDuration,
	sampleFps,
}: {
	sceneId: string;
	start: number;
	end: number;
	samples: FrameSample[];
	candidateDuration: number;
	sampleFps: number;
}): { stableRanges: IndexedRange[]; candidates: IndexedRange[] } {
	const duration = Math.min(candidateDuration, end - start);
	const candidateStarts = buildCandidateStarts({
		start,
		end,
		duration,
		step: Math.max(0.5, 1 / sampleFps),
	});
	const allCandidates = candidateStarts.map((candidateStart, index) =>
		makeRange({
			id: `${sceneId}-candidate-${index + 1}`,
			start: candidateStart,
			end: Math.min(end, candidateStart + duration),
			samples,
		})
	);
	const candidates = selectNonOverlapping({ ranges: allCandidates, limit: 3 });
	const stableRanges = candidates
		.filter(
			(candidate) =>
				candidate.metrics.stability >= 0.58 &&
				candidate.metrics.sharpness >= 0.35 &&
				candidate.metrics.exposure >= 0.45
		)
		.map((candidate, index) => ({
			...candidate,
			id: `${sceneId}-stable-${index + 1}`,
		}));
	return {
		stableRanges:
			stableRanges.length > 0 ? stableRanges : candidates.slice(0, 1),
		candidates,
	};
}

function overlapDuration({
	leftStart,
	leftEnd,
	rightStart,
	rightEnd,
}: {
	leftStart: number;
	leftEnd: number;
	rightStart: number;
	rightEnd: number;
}): number {
	return Math.max(
		0,
		Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart)
	);
}

function bestSemanticScene({
	scene,
	semanticScenes,
}: {
	scene: { start: number; end: number };
	semanticScenes: SemanticScene[];
}): SemanticScene | undefined {
	return [...semanticScenes].sort(
		(left, right) =>
			overlapDuration({
				leftStart: scene.start,
				leftEnd: scene.end,
				rightStart: right.start,
				rightEnd: right.end,
			}) -
			overlapDuration({
				leftStart: scene.start,
				leftEnd: scene.end,
				rightStart: left.start,
				rightEnd: left.end,
			})
	)[0];
}

function buildScenes({
	sourceId,
	duration,
	boundaries,
	samples,
	candidateDuration,
	sampleFps,
	semantics,
}: {
	sourceId: string;
	duration: number;
	boundaries: number[];
	samples: FrameSample[];
	candidateDuration: number;
	sampleFps: number;
	semantics?: SourceSemantics;
}): IndexedScene[] {
	const detected = [...new Set([0, ...boundaries, duration])]
		.filter((value) => value >= 0 && value <= duration)
		.sort((left, right) => left - right);
	const minimumUsefulScene = Math.min(1.5, candidateDuration / 3, duration / 3);
	const normalized: number[] = [];
	for (const boundary of detected) {
		if (boundary <= 0) {
			if (normalized.length === 0) normalized.push(0);
			continue;
		}
		if (boundary >= duration) {
			normalized.push(duration);
			continue;
		}
		const previous = normalized[normalized.length - 1] ?? 0;
		if (
			boundary - previous < minimumUsefulScene ||
			duration - boundary < minimumUsefulScene
		) {
			continue;
		}
		normalized.push(boundary);
	}
	if (normalized[normalized.length - 1] !== duration) normalized.push(duration);
	const intervals = normalized.slice(0, -1).flatMap((start, index) => {
		const end = normalized[index + 1];
		return end - start >= MIN_SCENE_DURATION ? [{ start, end }] : [];
	});
	if (intervals.length === 0) intervals.push({ start: 0, end: duration });

	return intervals.map((interval, index) => {
		const sceneId = `${sourceId}-scene-${index + 1}`;
		const rangeSamples = samplesInRange({
			samples,
			start: interval.start,
			end: interval.end,
		});
		const metrics = aggregateRangeMetrics({ samples: rangeSamples });
		const ranges = buildSceneRanges({
			sceneId,
			start: interval.start,
			end: interval.end,
			samples,
			candidateDuration,
			sampleFps,
		});
		const semanticScene = bestSemanticScene({
			scene: interval,
			semanticScenes: semantics?.scenes ?? [],
		});
		const semanticMetrics = semanticScene
			? {
					...metrics,
					motionDirection:
						semanticScene.motionDirection ?? metrics.motionDirection,
					subjectPosition:
						semanticScene.subjectPosition ?? metrics.subjectPosition,
				}
			: metrics;
		return {
			id: sceneId,
			start: round({ value: interval.start }),
			end: round({ value: interval.end }),
			duration: round({ value: interval.end - interval.start }),
			representativeTime: round({
				value:
					ranges.candidates[0]?.start +
						(ranges.candidates[0]?.duration ?? 0) / 2 ||
					(interval.start + interval.end) / 2,
			}),
			description: semanticScene?.description,
			tags: semanticScene?.tags ?? [],
			metrics: semanticMetrics,
			stableRanges: ranges.stableRanges.map((range) => ({
				...range,
				metrics: {
					...range.metrics,
					motionDirection:
						semanticScene?.motionDirection ?? range.metrics.motionDirection,
					subjectPosition:
						semanticScene?.subjectPosition ?? range.metrics.subjectPosition,
				},
			})),
			candidates: ranges.candidates.map((range) => ({
				...range,
				metrics: {
					...range.metrics,
					motionDirection:
						semanticScene?.motionDirection ?? range.metrics.motionDirection,
					subjectPosition:
						semanticScene?.subjectPosition ?? range.metrics.subjectPosition,
				},
			})),
		};
	});
}

async function indexSource({
	path,
	request,
	sourceNumber,
	totalSources,
}: {
	path: string;
	request: MediaIndexRequest;
	sourceNumber: number;
	totalSources: number;
}): Promise<IndexedMediaSource> {
	const filename = basename(path);
	const basePercent = ((sourceNumber - 1) / totalSources) * 100;
	const span = 100 / totalSources;
	const report = ({
		stage,
		fraction,
		message,
	}: {
		stage: string;
		fraction: number;
		message: string;
	}): void =>
		request.onProgress?.({
			stage,
			percent: Math.round(basePercent + span * fraction),
			message,
			source: filename,
		});
	report({ stage: "probing", fraction: 0, message: `Probing ${filename}` });
	const [stat, fingerprint, probe] = await Promise.all([
		fs.stat(path),
		fingerprintFile({ path }),
		probeMedia({ path }),
	]);
	report({
		stage: "analyzing",
		fraction: 0.15,
		message: `Detecting scenes and motion in ${filename}`,
	});
	const [boundaries, frames] = await Promise.all([
		detectSceneBoundaries({
			path,
			duration: probe.duration,
			threshold: request.sceneThreshold,
			signal: request.signal,
		}),
		extractGrayscaleSamples({
			path,
			fps: request.sampleFps,
			width: SAMPLE_WIDTH,
			height: SAMPLE_HEIGHT,
			signal: request.signal,
		}),
	]);
	const samples = buildFrameSamples({
		frames,
		fps: request.sampleFps,
		width: SAMPLE_WIDTH,
		height: SAMPLE_HEIGHT,
	}).filter((sample) => sample.time <= probe.duration + 0.01);
	const warnings: string[] = [];
	let semantics: SourceSemantics | undefined;
	if (request.analyzeSemantics) {
		report({
			stage: "semantic-analysis",
			fraction: 0.58,
			message: `Understanding ${filename}`,
		});
		try {
			semantics = await request.analyzeSemantics({
				path,
				probe,
				sceneBoundaries: boundaries,
				signal: request.signal ?? new AbortController().signal,
				onProgress: (percent, message) =>
					report({
						stage: "semantic-analysis",
						fraction: 0.58 + (percent / 100) * 0.32,
						message,
					}),
			});
		} catch (error) {
			warnings.push(
				`Semantic analysis failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
	const sourceId = `${slug({ value: filename })}-${fingerprint.slice(0, 8)}`;
	const scenes = buildScenes({
		sourceId,
		duration: probe.duration,
		boundaries,
		samples,
		candidateDuration: request.candidateDuration,
		sampleFps: request.sampleFps,
		semantics,
	});
	report({ stage: "indexed", fraction: 1, message: `Indexed ${filename}` });
	return {
		id: sourceId,
		source: resolve(path),
		filename,
		bytes: stat.size,
		modifiedAt: stat.mtime.toISOString(),
		fingerprint,
		probe,
		sceneBoundaries: boundaries,
		samples,
		scenes,
		stableRanges: scenes.flatMap((scene) => scene.stableRanges),
		candidates: scenes.flatMap((scene) => scene.candidates),
		semantics,
		warnings,
	};
}

async function indexSourcesSequentially({
	files,
	request,
	index,
	sources,
	warnings,
}: {
	files: string[];
	request: MediaIndexRequest;
	index: number;
	sources: IndexedMediaSource[];
	warnings: string[];
}): Promise<void> {
	if (index >= files.length) return;
	const path = files[index];
	try {
		sources.push(
			await indexSource({
				path,
				request,
				sourceNumber: index + 1,
				totalSources: files.length,
			})
		);
	} catch (error) {
		warnings.push(
			`${basename(path)}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	await indexSourcesSequentially({
		files,
		request,
		index: index + 1,
		sources,
		warnings,
	});
}

export async function createMediaIndex(
	request: MediaIndexRequest
): Promise<{ index: MediaIndex; indexPath: string }> {
	if (!Number.isFinite(request.sampleFps) || request.sampleFps <= 0) {
		throw new Error("sampleFps must be greater than zero");
	}
	if (
		!Number.isFinite(request.sceneThreshold) ||
		request.sceneThreshold <= 0 ||
		request.sceneThreshold >= 1
	) {
		throw new Error("sceneThreshold must be between zero and one");
	}
	if (
		!Number.isFinite(request.candidateDuration) ||
		request.candidateDuration <= 0
	) {
		throw new Error("candidateDuration must be greater than zero");
	}
	const root = resolve(request.directory);
	const files = await discoverVideoFiles({
		directory: root,
		recursive: request.recursive,
	});
	if (files.length === 0) throw new Error(`No video files found in ${root}`);
	const sources: IndexedMediaSource[] = [];
	const warnings: string[] = [];
	await indexSourcesSequentially({
		files,
		request,
		index: 0,
		sources,
		warnings,
	});
	if (sources.length === 0) {
		throw new Error(`No videos could be indexed: ${warnings.join("; ")}`);
	}
	const mediaIndex: MediaIndex = {
		version: MEDIA_INDEX_VERSION,
		createdAt: new Date().toISOString(),
		root,
		options: {
			sampleFps: request.sampleFps,
			sceneThreshold: request.sceneThreshold,
			candidateDuration: request.candidateDuration,
			recursive: request.recursive,
			semanticModel: request.semanticModel,
		},
		sources,
		warnings,
	};
	await fs.mkdir(request.outputDir, { recursive: true });
	const indexPath = resolve(request.outputDir, "index.json");
	await fs.writeFile(indexPath, `${JSON.stringify(mediaIndex, null, 2)}\n`);
	return { index: mediaIndex, indexPath };
}

export const mediaIndexInternals = {
	buildCandidateStarts,
	buildSceneRanges,
	buildScenes,
	makeRange,
	selectNonOverlapping,
};
