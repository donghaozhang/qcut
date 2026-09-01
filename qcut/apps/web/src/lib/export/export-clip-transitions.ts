/**
 * Clip transitions for canvas exports.
 *
 * The canvas engines (muxer, standard, optimized) render one frame at a
 * time with the shared frame renderer, which used to see only one clip at
 * a seam and therefore exported every transition as a hard cut. This
 * module decides, once per export, what happens to each transition:
 *
 * - QCut transitions whose presentation maps exactly onto canvas 2D
 *   primitives (alpha, translate/rotate/scale, inset/polygon clips, solid
 *   backdrops, CSS filters) render on canvas through the same
 *   `getClipTransitionLayerPresentation` runtime the preview uses.
 * - jianying-local transitions stay hard cuts on canvas and go through the
 *   native Jianying timeline pass on the finished MP4 — the same path the
 *   CLI engine uses, never a canvas approximation.
 * - Everything else (CSS mask images, gradient overlays, 3D perspective,
 *   skew, pixelation) is reported as unsupported so an engine can fail
 *   closed instead of silently dropping the transition.
 */

import type { MediaItem } from "@/stores/media/media-store-types";
import { exportProfiler } from "./export-profiler";
import type { ClipTransition, TimelineTrack } from "@/types/timeline";
import {
	buildClipTransitionCssFilter,
	getClipTransitionLayerPresentation,
	type ClipTransitionLayerPresentation,
	type ClipTransitionRole,
} from "@/lib/transitions/clip-transition-presentation";
import type { VideoTransitionInput } from "../export-cli/types";
import { extractVideoTransitions } from "../export-cli/sources/video-transitions";
import { partitionJianyingTransitions } from "./export-engine-cli-jianying";

export interface UnsupportedCanvasClipTransition {
	transition: VideoTransitionInput;
	reason: string;
}

export interface ExportClipTransitionPlan {
	/** Tracks whose transition lists keep only canvas-rendered transitions; null when there are none. */
	canvasTracks: TimelineTrack[] | null;
	canvasTransitions: VideoTransitionInput[];
	jianyingTransitions: VideoTransitionInput[];
	unsupported: UnsupportedCanvasClipTransition[];
}

export type ParsedClipPath =
	| { kind: "inset"; top: number; right: number; bottom: number; left: number }
	| { kind: "polygon"; points: Array<[number, number]> };

const CLASSIFY_PROGRESS_STOPS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
const ROLES: readonly ClipTransitionRole[] = ["from", "to"];
const CENTER_ORIGINS = new Set(["center", "50% 50%", "center center"]);

function parseFraction({ value }: { value: string }): number | null {
	const trimmed = value.trim();
	if (trimmed === "0") return 0;
	const match = /^(-?\d+(?:\.\d+)?)%$/.exec(trimmed);
	return match ? Number(match[1]) / 100 : null;
}

/**
 * Parses the clip-path strings the transition presentation emits
 * (`inset(...)` with percentages and `polygon(x% y%, ...)`) into canvas
 * fractions. Anything else is unsupported on canvas.
 */
export function parseClipTransitionClipPath({
	clipPath,
}: {
	clipPath: string;
}): ParsedClipPath | null {
	const inset = /^inset\((.+)\)$/.exec(clipPath.trim());
	if (inset) {
		const values = inset[1]
			.trim()
			.split(/\s+/)
			.map((value) => parseFraction({ value }));
		if (values.length < 1 || values.length > 4 || values.includes(null)) {
			return null;
		}
		const [top, right = top, bottom = top, left = right] = values as number[];
		return { kind: "inset", top, right, bottom, left };
	}
	const polygon = /^polygon\((.+)\)$/.exec(clipPath.trim());
	if (polygon) {
		const points: Array<[number, number]> = [];
		for (const pair of polygon[1].split(",")) {
			const [x, y, ...rest] = pair.trim().split(/\s+/);
			if (!x || !y || rest.length > 0) return null;
			const fx = parseFraction({ value: x });
			const fy = parseFraction({ value: y });
			if (fx === null || fy === null) return null;
			points.push([fx, fy]);
		}
		return points.length >= 3 ? { kind: "polygon", points } : null;
	}
	return null;
}

export function detectCanvasFilterSupport(): boolean {
	return (
		typeof CanvasRenderingContext2D !== "undefined" &&
		"filter" in CanvasRenderingContext2D.prototype
	);
}

function unsupportedPresentationReason({
	presentation,
	canvasFilterSupported,
}: {
	presentation: ClipTransitionLayerPresentation;
	canvasFilterSupported: boolean;
}): string | null {
	if (presentation.maskImage) return "CSS mask images";
	if (
		presentation.perspective ||
		presentation.rotationX ||
		presentation.rotationY
	) {
		return "3D perspective transforms";
	}
	if (presentation.skewX || presentation.skewY) return "skew transforms";
	if ((presentation.pixelScale ?? 1) > 1) return "pixelated upscaling";
	if (
		presentation.overlayBackground &&
		(presentation.overlayOpacity ?? 0) > 0
	) {
		return "CSS gradient overlays";
	}
	if (
		presentation.clipPath &&
		!parseClipTransitionClipPath({ clipPath: presentation.clipPath })
	) {
		return `clip-path "${presentation.clipPath}"`;
	}
	if (
		presentation.transformOrigin &&
		!CENTER_ORIGINS.has(presentation.transformOrigin)
	) {
		return `transform-origin "${presentation.transformOrigin}"`;
	}
	if (
		!canvasFilterSupported &&
		buildClipTransitionCssFilter({ presentation }) !== undefined
	) {
		return "canvas filters (blur/brightness/saturate/hue-rotate) in this browser";
	}
	return null;
}

/**
 * Decides whether a QCut transition renders exactly on canvas by
 * evaluating the shared presentation for both layers across the
 * transition window. The result is derived from the runtime, not from a
 * hand-maintained type list, so it tracks presentation changes.
 */
export function classifyCanvasClipTransition({
	transition,
	canvasWidth,
	canvasHeight,
	canvasFilterSupported,
}: {
	transition: ClipTransition;
	canvasWidth: number;
	canvasHeight: number;
	canvasFilterSupported: boolean;
}): { renderable: true } | { renderable: false; reason: string } {
	for (const role of ROLES) {
		for (const progress of CLASSIFY_PROGRESS_STOPS) {
			const presentation = getClipTransitionLayerPresentation({
				transition,
				role,
				progress,
				canvasWidth,
				canvasHeight,
			});
			const reason = unsupportedPresentationReason({
				presentation,
				canvasFilterSupported,
			});
			if (reason) return { renderable: false, reason };
		}
	}
	return { renderable: true };
}

function describeTransition({
	transition,
}: {
	transition: VideoTransitionInput;
}): string {
	const shape = transition.maskShape ? `/${transition.maskShape}` : "";
	return `"${transition.presetId}" (${transition.type}${shape})`;
}

/**
 * Builds the per-export transition plan. Reuses the CLI engine's transition
 * extraction and Jianying partition so every engine agrees on which seams
 * carry a transition and which of them belong to the native runtime.
 */
export function buildExportClipTransitionPlan({
	tracks,
	mediaItems,
	fps,
	canvasWidth,
	canvasHeight,
	canvasFilterSupported = detectCanvasFilterSupport(),
}: {
	tracks: readonly TimelineTrack[];
	mediaItems: readonly MediaItem[];
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
	canvasFilterSupported?: boolean;
}): ExportClipTransitionPlan {
	const hasTransitions = tracks.some(
		(track) => (track.transitions?.length ?? 0) > 0
	);
	if (!hasTransitions) {
		return {
			canvasTracks: null,
			canvasTransitions: [],
			jianyingTransitions: [],
			unsupported: [],
		};
	}
	const inputs = extractVideoTransitions({
		tracks: [...tracks],
		mediaItems: [...mediaItems],
		fps,
	});
	const { qcutTransitions, jianyingTransitions } = partitionJianyingTransitions(
		{ transitions: inputs }
	);
	const transitionsById = new Map<string, ClipTransition>();
	for (const track of tracks) {
		for (const transition of track.transitions ?? []) {
			transitionsById.set(transition.id, transition);
		}
	}

	const canvasTransitions: VideoTransitionInput[] = [];
	const unsupported: UnsupportedCanvasClipTransition[] = [];
	for (const input of qcutTransitions) {
		const transition = transitionsById.get(input.id);
		if (!transition) continue;
		const verdict = classifyCanvasClipTransition({
			transition,
			canvasWidth,
			canvasHeight,
			canvasFilterSupported,
		});
		if (verdict.renderable) {
			canvasTransitions.push(input);
		} else {
			unsupported.push({ transition: input, reason: verdict.reason });
		}
	}

	const canvasIds = new Set(canvasTransitions.map((input) => input.id));
	const canvasTracks =
		canvasIds.size === 0
			? null
			: tracks.map((track) =>
					track.transitions?.length
						? {
								...track,
								transitions: track.transitions.filter((transition) =>
									canvasIds.has(transition.id)
								),
							}
						: track
				);
	return { canvasTracks, canvasTransitions, jianyingTransitions, unsupported };
}

/** Throws a descriptive error when the plan contains transitions canvas can't render. */
export function assertCanvasClipTransitionsRenderable({
	plan,
	engineLabel,
}: {
	plan: ExportClipTransitionPlan;
	engineLabel: string;
}): void {
	if (plan.unsupported.length === 0) return;
	const details = plan.unsupported
		.map(
			({ transition, reason }) =>
				`${describeTransition({ transition })} needs ${reason}`
		)
		.join("; ");
	throw new Error(
		`The ${engineLabel} export engine cannot render these clip transitions and will not silently export a hard cut: ${details}. ` +
			"Export with the native CLI engine or pick a canvas-renderable transition (dissolve, fade, slide, push, wipe, zoom, whip-pan, flash, light leak, glitch, shake, motion blur, vortex)."
	);
}

function isIdentityPresentation({
	presentation,
}: {
	presentation: ClipTransitionLayerPresentation;
}): boolean {
	return (
		presentation.opacity === 1 &&
		presentation.contentOpacity === 1 &&
		presentation.offsetX === 0 &&
		presentation.offsetY === 0 &&
		(presentation.scale ?? 1) === 1 &&
		(presentation.rotation ?? 0) === 0 &&
		presentation.backgroundColor === undefined &&
		presentation.clipPath === undefined &&
		buildClipTransitionCssFilter({ presentation }) === undefined
	);
}

function applyClipPath({
	ctx,
	clip,
	width,
	height,
}: {
	ctx: CanvasRenderingContext2D;
	clip: ParsedClipPath;
	width: number;
	height: number;
}): void {
	ctx.beginPath();
	if (clip.kind === "inset") {
		const x = clip.left * width;
		const y = clip.top * height;
		ctx.rect(
			x,
			y,
			Math.max(0, width - x - clip.right * width),
			Math.max(0, height - y - clip.bottom * height)
		);
	} else {
		for (const [index, [fx, fy]] of clip.points.entries()) {
			if (index === 0) ctx.moveTo(fx * width, fy * height);
			else ctx.lineTo(fx * width, fy * height);
		}
		ctx.closePath();
	}
	ctx.clip();
}

let layerCanvas: HTMLCanvasElement | null = null;
let layerCtx: CanvasRenderingContext2D | null = null;

function getLayerContext({
	width,
	height,
}: {
	width: number;
	height: number;
}): CanvasRenderingContext2D | null {
	if (
		!layerCanvas ||
		layerCanvas.width !== width ||
		layerCanvas.height !== height
	) {
		layerCanvas = document.createElement("canvas");
		layerCanvas.width = width;
		layerCanvas.height = height;
		layerCtx = layerCanvas.getContext("2d");
	}
	return layerCtx;
}

/** Releases the pooled layer canvas after an export finishes. */
export function destroyClipTransitionLayer(): void {
	layerCanvas = null;
	layerCtx = null;
}

export interface ClipTransitionLayer {
	/** Draw the clip's content into this context. */
	ctx: CanvasRenderingContext2D;
	/** True when content is routed through the offscreen group layer. */
	active: boolean;
	/** Composites the group layer onto the export canvas. */
	finish(): void;
}

/**
 * Mirrors the preview's layer model on canvas: the clip lives in a
 * canvas-sized box centered at the canvas center plus its position offset;
 * the transition's backdrop and content opacity apply inside the box, and
 * its opacity, filter, offset, rotation/scale about the box center, and
 * clip-path apply to the box as a group. Identity presentations draw
 * straight onto the export canvas so untouched frames stay byte-stable.
 */
export function beginClipTransitionLayer({
	ctx,
	width,
	height,
	presentation,
	anchor,
	layerOpacity = 1,
	layerContext,
}: {
	ctx: CanvasRenderingContext2D;
	width: number;
	height: number;
	presentation: ClipTransitionLayerPresentation;
	/** Element position offset from the canvas center, in canvas pixels. */
	anchor: { x: number; y: number };
	/** Element opacity, applied to the whole group like the preview does. */
	layerOpacity?: number;
	/** Offscreen group context; defaults to the pooled canvas. */
	layerContext?: CanvasRenderingContext2D | null;
}): ClipTransitionLayer {
	if (isIdentityPresentation({ presentation }) && layerOpacity === 1) {
		return { ctx, active: false, finish: () => undefined };
	}
	const group = layerContext ?? getLayerContext({ width, height });
	if (!group) {
		return { ctx, active: false, finish: () => undefined };
	}

	exportProfiler.count("transition-layer-frames");
	const layerStart = performance.now();
	group.setTransform(1, 0, 0, 1, 0, 0);
	group.filter = "none";
	group.globalAlpha = 1;
	group.clearRect(0, 0, width, height);
	group.save();
	if (presentation.backgroundColor) {
		group.fillStyle = presentation.backgroundColor;
		group.fillRect(0, 0, width, height);
	}
	// Box-local coordinates: the box's top-left sits at the element offset.
	group.translate(-anchor.x, -anchor.y);
	group.globalAlpha = Math.min(1, Math.max(0, presentation.contentOpacity));

	exportProfiler.record(
		"transition-layer-begin",
		performance.now() - layerStart
	);

	return {
		ctx: group,
		active: true,
		finish: () => {
			const finishStart = performance.now();
			group.restore();
			const clip = presentation.clipPath
				? parseClipTransitionClipPath({ clipPath: presentation.clipPath })
				: null;
			const filter = buildClipTransitionCssFilter({ presentation });
			const centerX = width / 2 + anchor.x;
			const centerY = height / 2 + anchor.y;
			ctx.save();
			try {
				if (filter) ctx.filter = filter;
				ctx.globalAlpha *=
					Math.min(1, Math.max(0, presentation.opacity)) *
					Math.min(1, Math.max(0, layerOpacity));
				ctx.translate(
					centerX + presentation.offsetX,
					centerY + presentation.offsetY
				);
				ctx.rotate(((presentation.rotation ?? 0) * Math.PI) / 180);
				const scale = presentation.scale ?? 1;
				ctx.scale(scale, scale);
				ctx.translate(-width / 2, -height / 2);
				if (clip) applyClipPath({ ctx, clip, width, height });
				ctx.drawImage(group.canvas, 0, 0);
			} finally {
				ctx.restore();
				exportProfiler.record(
					"transition-layer-finish",
					performance.now() - finishStart
				);
			}
		},
	};
}
