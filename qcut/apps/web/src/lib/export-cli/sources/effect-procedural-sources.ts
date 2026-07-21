import type {
	EffectDecorationRenderStage,
	EffectParticleRenderStage,
	EffectRenderProgram,
	TimelineTrack,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import {
	drawDecorationStageFrame,
	drawParticleStageFrame,
	isDecorationStageAnimated,
} from "@/lib/effects/effect-procedural-draw";
import type { EffectOverlaySourceInput } from "../types";

type LogFn = (...args: unknown[]) => void;

type ProceduralRenderStage =
	| EffectParticleRenderStage
	| EffectDecorationRenderStage;

interface ProceduralStageReference {
	elementId: string;
	stageIndex: number;
	stage: ProceduralRenderStage;
}

interface EffectSequenceExportAPI {
	saveEffectSequenceFrame: (params: {
		sessionId: string;
		sequenceId: string;
		frameIndex: number;
		imageData: Uint8Array;
	}) => Promise<{
		success: boolean;
		path?: string;
		patternPath?: string;
		error?: string;
	}>;
}

interface ProceduralFrameCanvas {
	width: number;
	height: number;
	getContext(kind: "2d"): OffscreenCanvasRenderingContext2D | null;
	convertToBlob(options?: { type?: string }): Promise<Blob>;
}

export type CreateProceduralFrameCanvas = ({
	width,
	height,
}: {
	width: number;
	height: number;
}) => ProceduralFrameCanvas;

function collectProceduralStageReferences({
	programsByElementId,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
}): ProceduralStageReference[] {
	const references: ProceduralStageReference[] = [];
	for (const [elementId, program] of programsByElementId) {
		for (const [stageIndex, stage] of program.stages.entries()) {
			if (stage.kind !== "particles" && stage.kind !== "decoration") continue;
			references.push({ elementId, stageIndex, stage });
		}
	}
	return references;
}

function proceduralResourceId({
	stage,
}: {
	stage: ProceduralRenderStage;
}): string {
	return `procedural:${stage.kind}:${stage.variant}`;
}

function sequenceId({
	elementId,
	stageIndex,
}: {
	elementId: string;
	stageIndex: number;
}): string {
	return `${elementId.replace(/[^a-zA-Z0-9._-]/g, "_")}-s${stageIndex}`;
}

function isStageAnimated({ stage }: { stage: ProceduralRenderStage }): boolean {
	if (stage.kind === "particles") return true;
	return isDecorationStageAnimated({ stage });
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

function drawProceduralFrame({
	context,
	stage,
	timeSeconds,
	width,
	height,
}: {
	context: OffscreenCanvasRenderingContext2D;
	stage: ProceduralRenderStage;
	timeSeconds: number;
	width: number;
	height: number;
}) {
	context.clearRect(0, 0, width, height);
	if (stage.kind === "particles") {
		drawParticleStageFrame({ context, stage, timeSeconds, width, height });
		return;
	}
	drawDecorationStageFrame({ context, stage, timeSeconds, width, height });
}

async function bakeStageSequence({
	api,
	canvasHeight,
	canvasWidth,
	createCanvas,
	fps,
	durationSeconds,
	logger,
	onFrameBaked,
	reference,
	sessionId,
}: {
	api: EffectSequenceExportAPI;
	canvasHeight: number;
	canvasWidth: number;
	createCanvas: CreateProceduralFrameCanvas;
	fps: number;
	durationSeconds: number;
	logger: LogFn;
	onFrameBaked?: () => void;
	reference: ProceduralStageReference;
	sessionId: string;
}): Promise<EffectOverlaySourceInput> {
	const animated = isStageAnimated({ stage: reference.stage });
	const frameCount = animated
		? Math.max(1, Math.ceil(durationSeconds * fps))
		: 1;
	const canvas = createCanvas({ width: canvasWidth, height: canvasHeight });
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Procedural effect bake could not create a 2D context");
	}

	const id = sequenceId(reference);
	let firstPath: string | undefined;
	let patternPath: string | undefined;
	for (let frame = 0; frame < frameCount; frame += 1) {
		drawProceduralFrame({
			context,
			stage: reference.stage,
			timeSeconds: frame / fps,
			width: canvasWidth,
			height: canvasHeight,
		});
		const blob = await canvas.convertToBlob({ type: "image/png" });
		const result = await api.saveEffectSequenceFrame({
			sessionId,
			sequenceId: id,
			frameIndex: frame,
			imageData: new Uint8Array(await blob.arrayBuffer()),
		});
		if (!result.success) {
			throw new Error(
				result.error ||
					`Failed to save procedural effect frame ${frame} for ${id}`
			);
		}
		firstPath ??= result.path;
		patternPath ??= result.patternPath;
		onFrameBaked?.();
	}

	if (animated) {
		if (!patternPath) {
			throw new Error(`Procedural effect sequence has no pattern path: ${id}`);
		}
		logger(
			`[EffectProceduralSources] Baked ${frameCount} frames for ${id}: ${patternPath}`
		);
		return {
			resourceId: proceduralResourceId({ stage: reference.stage }),
			stageIndex: reference.stageIndex,
			path: patternPath,
			animated: true,
			sequence: { framerate: fps },
		};
	}

	if (!firstPath) {
		throw new Error(`Procedural effect frame saved without a path: ${id}`);
	}
	logger(
		`[EffectProceduralSources] Baked static frame for ${id}: ${firstPath}`
	);
	return {
		resourceId: proceduralResourceId({ stage: reference.stage }),
		stageIndex: reference.stageIndex,
		path: firstPath,
		animated: false,
	};
}

/**
 * Bakes particle/decoration render stages into transparent RGBA frame
 * sequences on disk so the native FFmpeg export composites the exact frames
 * the preview draws. Static decorations bake a single frame (looped by
 * FFmpeg); animated stages bake one PNG per output frame.
 */
export async function extractEffectProceduralSources({
	programsByElementId,
	tracks,
	sessionId,
	canvasWidth,
	canvasHeight,
	fps,
	api = platform().ffmpeg as unknown as EffectSequenceExportAPI,
	createCanvas = ({ width, height }) => new OffscreenCanvas(width, height),
	logger = console.log,
	onProgress,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	tracks: readonly TimelineTrack[];
	sessionId: string;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
	api?: EffectSequenceExportAPI;
	createCanvas?: CreateProceduralFrameCanvas;
	logger?: LogFn;
	onProgress?: ({
		bakedFrames,
		totalFrames,
	}: {
		bakedFrames: number;
		totalFrames: number;
	}) => void;
}): Promise<ReadonlyMap<string, EffectOverlaySourceInput[]>> {
	const references = collectProceduralStageReferences({ programsByElementId });
	if (references.length === 0) return new Map();
	if (!api?.saveEffectSequenceFrame) {
		throw new Error("Procedural effect export API is unavailable");
	}
	if (!(fps > 0)) {
		throw new Error(`Procedural effect bake requires a positive fps: ${fps}`);
	}

	const jobs = references.map((reference) => {
		const durationSeconds = elementTimelineDurationSeconds({
			tracks,
			elementId: reference.elementId,
		});
		if (durationSeconds === undefined) {
			throw new Error(
				`Procedural effect target is missing from the timeline: ${reference.elementId}`
			);
		}
		const frames = isStageAnimated({ stage: reference.stage })
			? Math.max(1, Math.ceil(durationSeconds * fps))
			: 1;
		return { reference, durationSeconds, frames };
	});
	const totalFrames = jobs.reduce((sum, job) => sum + job.frames, 0);
	let bakedFrames = 0;

	// Bake sequentially: each frame already saturates canvas rasterize + PNG
	// encode, and sequential IPC keeps memory flat for long timelines.
	const sourcesByElementId = new Map<string, EffectOverlaySourceInput[]>();
	for (const job of jobs) {
		const source = await bakeStageSequence({
			api,
			canvasHeight,
			canvasWidth,
			createCanvas,
			fps,
			durationSeconds: job.durationSeconds,
			logger,
			onFrameBaked: () => {
				bakedFrames += 1;
				onProgress?.({ bakedFrames, totalFrames });
			},
			reference: job.reference,
			sessionId,
		});
		const sources = sourcesByElementId.get(job.reference.elementId) ?? [];
		sources.push(source);
		sourcesByElementId.set(job.reference.elementId, sources);
	}
	return sourcesByElementId;
}
