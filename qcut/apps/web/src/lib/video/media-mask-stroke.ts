import type { MediaMask, MediaMaskStroke } from "@/types/timeline";

const DEFAULT_STROKE: MediaMaskStroke = {
	style: "none",
	color: "#ffffff",
	width: 0,
	opacity: 1,
	glow: 0,
	offsetX: 0,
	offsetY: 0,
};

function clamp({ value, min, max }: { value: number; min: number; max: number }) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function colorWithOpacity({ color, opacity }: { color: string; opacity: number }) {
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!match) return `rgba(255, 255, 255, ${opacity})`;
	const value = Number.parseInt(match[1], 16);
	return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

export function activeMediaMaskStroke({
	masks,
}: {
	masks: MediaMask[];
}): MediaMaskStroke | null {
	const configured = masks.find(
		(mask) =>
			mask.enabled !== false &&
			mask.stroke?.style !== undefined &&
			mask.stroke.style !== "none" &&
			mask.stroke.width > 0
	)?.stroke;
	if (!configured) return null;
	return {
		...DEFAULT_STROKE,
		...configured,
		width: clamp({ value: configured.width, min: 0, max: 32 }),
		opacity: clamp({ value: configured.opacity, min: 0, max: 1 }),
		glow: clamp({ value: configured.glow, min: 0, max: 64 }),
		offsetX: clamp({ value: configured.offsetX, min: -64, max: 64 }),
		offsetY: clamp({ value: configured.offsetY, min: -64, max: 64 }),
	};
}

export function buildMediaMaskStrokeCssFilter({
	masks,
}: {
	masks: MediaMask[];
}): string {
	const stroke = activeMediaMaskStroke({ masks });
	if (!stroke) return "";
	const color = colorWithOpacity({
		color: stroke.color,
		opacity: stroke.opacity,
	});
	const width = stroke.width;
	if (stroke.style === "glow") {
		const glow = Math.max(width, stroke.glow);
		return `drop-shadow(0 0 ${glow}px ${color}) drop-shadow(0 0 ${Math.max(1, glow / 2)}px ${color})`;
	}
	if (stroke.style === "offset") {
		return `drop-shadow(${stroke.offsetX}px ${stroke.offsetY}px ${Math.max(0, width / 3)}px ${color})`;
	}
	if (stroke.style === "triple") {
		return [width, width * 2, width * 3]
			.map((radius) => `drop-shadow(0 0 ${radius}px ${color})`)
			.join(" ");
	}
	if (stroke.style === "sketch") {
		return [
			`drop-shadow(${width}px 0 0 ${color})`,
			`drop-shadow(${-width * 0.7}px ${width * 0.4}px 0 ${color})`,
			`drop-shadow(0 ${-width}px ${Math.max(0.5, width / 4)}px ${color})`,
		].join(" ");
	}
	if (stroke.style === "dashed") {
		return [
			`drop-shadow(${width}px 0 0 ${color})`,
			`drop-shadow(${-width}px 0 0 ${color})`,
			`drop-shadow(0 ${width}px 0 ${color})`,
			`drop-shadow(0 ${-width}px 0 ${color})`,
		].join(" ");
	}
	return [
		[width, 0],
		[-width, 0],
		[0, width],
		[0, -width],
		[width * 0.7, width * 0.7],
		[-width * 0.7, width * 0.7],
		[width * 0.7, -width * 0.7],
		[-width * 0.7, -width * 0.7],
	]
		.map(([x, y]) => `drop-shadow(${x}px ${y}px 0 ${color})`)
		.join(" ");
}
