import type {
	MediaCustomCutout,
	MediaCustomCutoutPoint,
	MediaCustomCutoutStroke,
	MediaFitMode,
} from "@/types/timeline";

export const DEFAULT_MEDIA_CUSTOM_CUTOUT: MediaCustomCutout = {
	enabled: false,
	applyStrokes: true,
	strokes: [],
	status: "idle",
};

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizePoint({
	point,
}: {
	point: MediaCustomCutoutPoint;
}): MediaCustomCutoutPoint {
	return {
		x: clamp({ value: point.x, min: 0, max: 1 }),
		y: clamp({ value: point.y, min: 0, max: 1 }),
	};
}

export function normalizeMediaCustomCutout(
	customCutout?: Partial<MediaCustomCutout>
): MediaCustomCutout {
	return {
		enabled: customCutout?.enabled ?? DEFAULT_MEDIA_CUSTOM_CUTOUT.enabled,
		applyStrokes:
			customCutout?.applyStrokes ?? DEFAULT_MEDIA_CUSTOM_CUTOUT.applyStrokes,
		strokes: (customCutout?.strokes ?? [])
			.slice(-96)
			.map((stroke) => ({
				id: stroke.id,
				frame: Math.max(0, Math.round(stroke.frame)),
				mode: stroke.mode,
				size: clamp({ value: stroke.size, min: 0.005, max: 0.25 }),
				points: stroke.points
					.slice(-512)
					.map((point) => normalizePoint({ point })),
			}))
			.filter((stroke) => stroke.points.length > 0),
		status: customCutout?.status ?? DEFAULT_MEDIA_CUSTOM_CUTOUT.status,
		error: customCutout?.error,
		sourceMediaId: customCutout?.sourceMediaId,
		resultMaskId: customCutout?.resultMaskId,
		generatedFrom: customCutout?.generatedFrom,
	};
}

export function activeCustomCutoutStrokes({
	customCutout,
	currentFrame,
}: {
	customCutout?: Partial<MediaCustomCutout>;
	currentFrame: number;
}): MediaCustomCutoutStroke[] {
	const normalized = normalizeMediaCustomCutout(customCutout);
	if (!normalized.enabled || !normalized.applyStrokes) return [];
	const frames = [
		...new Set(normalized.strokes.map((stroke) => stroke.frame)),
	].sort((left, right) => left - right);
	if (frames.length === 0) return [];
	const correctionFrame =
		[...frames].reverse().find((frame) => frame <= currentFrame) ?? frames[0];
	return normalized.strokes.filter((stroke) => stroke.frame <= correctionFrame);
}

function strokePath({ stroke }: { stroke: MediaCustomCutoutStroke }): string {
	return stroke.points
		.map(
			(point, index) =>
				`${index === 0 ? "M" : "L"} ${point.x * 100} ${point.y * 100}`
		)
		.join(" ");
}

export function buildMediaCustomCutoutSvgContent({
	customCutout,
	currentFrame,
}: {
	customCutout?: Partial<MediaCustomCutout>;
	currentFrame: number;
}): { baseColor: "black" | "white"; shapes: string } | null {
	const strokes = activeCustomCutoutStrokes({ customCutout, currentFrame });
	if (strokes.length === 0) return null;
	const hasForeground = strokes.some((stroke) => stroke.mode === "foreground");
	const shapes = strokes
		.map((stroke) => {
			const color = stroke.mode === "foreground" ? "white" : "black";
			const first = stroke.points[0];
			if (stroke.points.length === 1) {
				return `<circle cx="${first.x * 100}" cy="${first.y * 100}" r="${stroke.size * 50}" fill="${color}"/>`;
			}
			return `<path d="${strokePath({ stroke })}" fill="none" stroke="${color}" stroke-width="${stroke.size * 100}" stroke-linecap="round" stroke-linejoin="round"/>`;
		})
		.join("");
	return { baseColor: hasForeground ? "black" : "white", shapes };
}

export function buildMediaCustomCutoutSvg({
	customCutout,
	currentFrame,
}: {
	customCutout?: Partial<MediaCustomCutout>;
	currentFrame: number;
}): string | null {
	const content = buildMediaCustomCutoutSvgContent({
		customCutout,
		currentFrame,
	});
	if (!content) return null;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${content.baseColor}"/>${content.shapes}</svg>`;
}

export function mediaCustomCutoutMaskUrl({
	customCutout,
	currentFrame,
}: {
	customCutout?: Partial<MediaCustomCutout>;
	currentFrame: number;
}): string | null {
	const svg = buildMediaCustomCutoutSvg({ customCutout, currentFrame });
	return svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : null;
}

function distanceToSegment({
	point,
	start,
	end,
}: {
	point: MediaCustomCutoutPoint;
	start: MediaCustomCutoutPoint;
	end: MediaCustomCutoutPoint;
}) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0)
		return Math.hypot(point.x - start.x, point.y - start.y);
	const progress = clamp({
		value:
			((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
		min: 0,
		max: 1,
	});
	return Math.hypot(
		point.x - (start.x + progress * dx),
		point.y - (start.y + progress * dy)
	);
}

export function eraseCustomCutoutStrokes({
	strokes,
	point,
	size,
	frame,
}: {
	strokes: MediaCustomCutoutStroke[];
	point: MediaCustomCutoutPoint;
	size: number;
	frame: number;
}): MediaCustomCutoutStroke[] {
	return strokes.filter((stroke) => {
		if (stroke.frame !== frame) return true;
		const radius = (stroke.size + size) / 2;
		if (stroke.points.length === 1) {
			return (
				Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) >
				radius
			);
		}
		for (let index = 1; index < stroke.points.length; index += 1) {
			if (
				distanceToSegment({
					point,
					start: stroke.points[index - 1],
					end: stroke.points[index],
				}) <= radius
			) {
				return false;
			}
		}
		return true;
	});
}

export function appendCustomCutoutPoint({
	points,
	point,
	minimumDistance,
}: {
	points: MediaCustomCutoutPoint[];
	point: MediaCustomCutoutPoint;
	minimumDistance: number;
}): MediaCustomCutoutPoint[] {
	const normalized = normalizePoint({ point });
	const previous = points[points.length - 1];
	if (
		previous &&
		Math.hypot(normalized.x - previous.x, normalized.y - previous.y) <
			minimumDistance
	) {
		return points;
	}
	return [...points, normalized];
}

export function sampleCustomCutoutStroke({
	stroke,
	maxPoints = 16,
}: {
	stroke: MediaCustomCutoutStroke;
	maxPoints?: number;
}): MediaCustomCutoutPoint[] {
	if (stroke.points.length <= maxPoints)
		return stroke.points.map((point) => ({ ...point }));
	return Array.from({ length: maxPoints }, (_, index) => {
		const sourceIndex = Math.round(
			(index / Math.max(1, maxPoints - 1)) * (stroke.points.length - 1)
		);
		return { ...stroke.points[sourceIndex] };
	});
}

export function compositionPointToSourcePixel({
	point,
	fitMode,
	sourceWidth,
	sourceHeight,
	canvasWidth,
	canvasHeight,
}: {
	point: MediaCustomCutoutPoint;
	fitMode: MediaFitMode;
	sourceWidth: number;
	sourceHeight: number;
	canvasWidth: number;
	canvasHeight: number;
}): { x: number; y: number } | null {
	const safeSourceWidth = Math.max(1, sourceWidth);
	const safeSourceHeight = Math.max(1, sourceHeight);
	const safeCanvasWidth = Math.max(1, canvasWidth);
	const safeCanvasHeight = Math.max(1, canvasHeight);
	if (fitMode === "fill") {
		return {
			x: Math.round(point.x * safeSourceWidth),
			y: Math.round(point.y * safeSourceHeight),
		};
	}
	const scale =
		fitMode === "cover"
			? Math.max(
					safeCanvasWidth / safeSourceWidth,
					safeCanvasHeight / safeSourceHeight
				)
			: Math.min(
					safeCanvasWidth / safeSourceWidth,
					safeCanvasHeight / safeSourceHeight
				);
	const drawWidth = safeSourceWidth * scale;
	const drawHeight = safeSourceHeight * scale;
	const offsetX = (safeCanvasWidth - drawWidth) / 2;
	const offsetY = (safeCanvasHeight - drawHeight) / 2;
	const displayX = point.x * safeCanvasWidth;
	const displayY = point.y * safeCanvasHeight;
	if (
		fitMode === "contain" &&
		(displayX < offsetX ||
			displayX > offsetX + drawWidth ||
			displayY < offsetY ||
			displayY > offsetY + drawHeight)
	) {
		return null;
	}
	return {
		x: Math.round(
			clamp({ value: (displayX - offsetX) / drawWidth, min: 0, max: 1 }) *
				safeSourceWidth
		),
		y: Math.round(
			clamp({ value: (displayY - offsetY) / drawHeight, min: 0, max: 1 }) *
				safeSourceHeight
		),
	};
}

export function customCutoutSignature({
	customCutout,
}: {
	customCutout: MediaCustomCutout;
}): string {
	const input = JSON.stringify(
		customCutout.strokes.map((stroke) => ({
			frame: stroke.frame,
			mode: stroke.mode,
			size: Number(stroke.size.toFixed(4)),
			points: stroke.points.map((point) => [
				Number(point.x.toFixed(4)),
				Number(point.y.toFixed(4)),
			]),
		}))
	);
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
