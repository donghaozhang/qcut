import {
	sampleDistortionSource,
	type EffectDistortionRenderStage,
	type EffectRenderProgram,
	type TimelineTrack,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import type { EffectDistortionSourceInput } from "../types";

type LogFn = (...args: unknown[]) => void;

interface DistortionStageReference {
	elementId: string;
	stageIndex: number;
	stage: EffectDistortionRenderStage;
}

interface EffectSequenceExportAPI {
	saveEffectSequenceFrame: (params: {
		sessionId: string;
		sequenceId: string;
		frameIndex: number;
		imageData: Uint8Array;
		extension?: string;
	}) => Promise<{
		success: boolean;
		path?: string;
		patternPath?: string;
		error?: string;
	}>;
}

/**
 * Remap coordinate maps are sampled at a reduced resolution and scaled back
 * up inside the FFmpeg graph (mirrors the preview's capped remap buffer).
 */
const MAP_MAX_SIDE = 480;

function collectDistortionStageReferences({
	programsByElementId,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
}): DistortionStageReference[] {
	const references: DistortionStageReference[] = [];
	for (const [elementId, program] of programsByElementId) {
		for (const [stageIndex, stage] of program.stages.entries()) {
			if (stage.kind !== "distortion") continue;
			references.push({ elementId, stageIndex, stage });
		}
	}
	return references;
}

/** Fisheye and magnifier ignore time; ripple and shockwave animate. */
function isDistortionStageAnimated({
	stage,
}: {
	stage: EffectDistortionRenderStage;
}): boolean {
	return stage.variant === "ripple" || stage.variant === "shockwave";
}

function sequenceId({
	elementId,
	stageIndex,
	axis,
}: {
	elementId: string;
	stageIndex: number;
	axis: "x" | "y";
}): string {
	return `${elementId.replace(/[^a-zA-Z0-9._-]/g, "_")}-s${stageIndex}${axis}`;
}

function elementTimelineDurationSeconds({
	tracks,
	elementId,
}: {
	tracks: readonly TimelineTrack[];
	elementId: string;
}): number | undefined {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.id !== elementId) continue;
			return Math.max(
				0,
				element.duration - element.trimStart - element.trimEnd
			);
		}
	}
	return undefined;
}

function mapDimensions({
	canvasWidth,
	canvasHeight,
}: {
	canvasWidth: number;
	canvasHeight: number;
}): { mapWidth: number; mapHeight: number } {
	const scale = Math.min(1, MAP_MAX_SIDE / Math.max(canvasWidth, canvasHeight));
	return {
		mapWidth: Math.max(2, Math.round(canvasWidth * scale)),
		mapHeight: Math.max(2, Math.round(canvasHeight * scale)),
	};
}

/**
 * Renders one xmap/ymap pair for FFmpeg's remap filter as 16-bit P5 PGM
 * buffers. Values are absolute source coordinates in full-resolution pixel
 * units, so the maps can be generated small and scaled up in-graph.
 */
export function renderDistortionMapPair({
	stage,
	timeSeconds,
	mapWidth,
	mapHeight,
	sourceWidth,
	sourceHeight,
}: {
	stage: EffectDistortionRenderStage;
	timeSeconds: number;
	mapWidth: number;
	mapHeight: number;
	sourceWidth: number;
	sourceHeight: number;
}): { xmap: Uint8Array; ymap: Uint8Array } {
	const header = new TextEncoder().encode(
		`P5\n${mapWidth} ${mapHeight}\n65535\n`
	);
	const xmap = new Uint8Array(header.length + mapWidth * mapHeight * 2);
	const ymap = new Uint8Array(header.length + mapWidth * mapHeight * 2);
	xmap.set(header);
	ymap.set(header);

	let offset = header.length;
	for (let y = 0; y < mapHeight; y += 1) {
		for (let x = 0; x < mapWidth; x += 1) {
			const sample = sampleDistortionSource({
				stage,
				u: (x + 0.5) / mapWidth,
				v: (y + 0.5) / mapHeight,
				timeSeconds,
			});
			const sx = Math.round(sample.u * (sourceWidth - 1));
			const sy = Math.round(sample.v * (sourceHeight - 1));
			// PGM P5 with maxval 65535 stores big-endian 16-bit samples.
			xmap[offset] = (sx >> 8) & 0xff;
			xmap[offset + 1] = sx & 0xff;
			ymap[offset] = (sy >> 8) & 0xff;
			ymap[offset + 1] = sy & 0xff;
			offset += 2;
		}
	}
	return { xmap, ymap };
}

async function bakeDistortionStage({
	api,
	canvasHeight,
	canvasWidth,
	fps,
	durationSeconds,
	logger,
	reference,
	sessionId,
}: {
	api: EffectSequenceExportAPI;
	canvasHeight: number;
	canvasWidth: number;
	fps: number;
	durationSeconds: number;
	logger: LogFn;
	reference: DistortionStageReference;
	sessionId: string;
}): Promise<EffectDistortionSourceInput> {
	const animated = isDistortionStageAnimated({ stage: reference.stage });
	const frameCount = animated
		? Math.max(1, Math.ceil(durationSeconds * fps))
		: 1;
	const { mapWidth, mapHeight } = mapDimensions({ canvasWidth, canvasHeight });

	const xSequenceId = sequenceId({ ...reference, axis: "x" });
	const ySequenceId = sequenceId({ ...reference, axis: "y" });
	let xmapPath: string | undefined;
	let ymapPath: string | undefined;
	for (let frame = 0; frame < frameCount; frame += 1) {
		const pair = renderDistortionMapPair({
			stage: reference.stage,
			timeSeconds: frame / fps,
			mapWidth,
			mapHeight,
			sourceWidth: canvasWidth,
			sourceHeight: canvasHeight,
		});
		const [xResult, yResult] = await Promise.all([
			api.saveEffectSequenceFrame({
				sessionId,
				sequenceId: xSequenceId,
				frameIndex: frame,
				imageData: pair.xmap,
				extension: "pgm",
			}),
			api.saveEffectSequenceFrame({
				sessionId,
				sequenceId: ySequenceId,
				frameIndex: frame,
				imageData: pair.ymap,
				extension: "pgm",
			}),
		]);
		for (const result of [xResult, yResult]) {
			if (!result.success) {
				throw new Error(
					result.error ||
						`Failed to save distortion map frame ${frame} for ${xSequenceId}`
				);
			}
		}
		xmapPath ??= animated ? xResult.patternPath : xResult.path;
		ymapPath ??= animated ? yResult.patternPath : yResult.path;
	}

	if (!xmapPath || !ymapPath) {
		throw new Error(`Distortion maps saved without paths: ${xSequenceId}`);
	}
	logger(
		`[EffectDistortionSources] Baked ${frameCount} map pair(s) for ${xSequenceId} (${mapWidth}x${mapHeight})`
	);
	return {
		stageIndex: reference.stageIndex,
		xmapPath,
		ymapPath,
		animated,
		...(animated ? { sequence: { framerate: fps } } : {}),
	};
}

/**
 * Bakes distortion render stages (鱼眼/放大镜/水波纹/冲击波) into remap
 * coordinate-map files so native FFmpeg reproduces the preview's per-pixel
 * source remapping. Static variants bake one map pair; animated variants
 * bake one pair per output frame.
 */
export async function extractEffectDistortionSources({
	programsByElementId,
	tracks,
	sessionId,
	canvasWidth,
	canvasHeight,
	fps,
	api = platform().ffmpeg as unknown as EffectSequenceExportAPI,
	logger = console.log,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	tracks: readonly TimelineTrack[];
	sessionId: string;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	api?: EffectSequenceExportAPI;
	logger?: LogFn;
}): Promise<ReadonlyMap<string, EffectDistortionSourceInput[]>> {
	const references = collectDistortionStageReferences({ programsByElementId });
	if (references.length === 0) return new Map();
	if (!api?.saveEffectSequenceFrame) {
		throw new Error("Distortion effect export API is unavailable");
	}
	if (!(fps > 0)) {
		throw new Error(`Distortion map bake requires a positive fps: ${fps}`);
	}

	const sourcesByElementId = new Map<string, EffectDistortionSourceInput[]>();
	for (const reference of references) {
		const durationSeconds = elementTimelineDurationSeconds({
			tracks,
			elementId: reference.elementId,
		});
		if (durationSeconds === undefined) {
			throw new Error(
				`Distortion effect target is missing from the timeline: ${reference.elementId}`
			);
		}
		const source = await bakeDistortionStage({
			api,
			canvasHeight,
			canvasWidth,
			fps,
			durationSeconds,
			logger,
			reference,
			sessionId,
		});
		const sources = sourcesByElementId.get(reference.elementId) ?? [];
		sources.push(source);
		sourcesByElementId.set(reference.elementId, sources);
	}
	return sourcesByElementId;
}
