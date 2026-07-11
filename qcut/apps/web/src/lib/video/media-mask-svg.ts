import type {
	MediaCustomCutout,
	MediaMask,
	MediaMaskPoint,
} from "@/types/timeline";
import { normalizeMediaMask } from "./video-properties";
import { buildMediaCustomCutoutSvgContent } from "./media-custom-cutout";

const SVG_SIZE = 100;

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function scaledMaskBounds(mask: MediaMask) {
	const expansion = mask.expansion ?? 0;
	const width = Math.max(0.1, (mask.width + expansion * 2) * SVG_SIZE);
	const height = Math.max(0.1, (mask.height + expansion * 2) * SVG_SIZE);
	const centerX = mask.centerX * SVG_SIZE;
	const centerY = mask.centerY * SVG_SIZE;
	return {
		centerX,
		centerY,
		width,
		height,
		left: centerX - width / 2,
		top: centerY - height / 2,
	};
}

function rotatePoint({
	x,
	y,
	centerX,
	centerY,
	rotation,
}: {
	x: number;
	y: number;
	centerX: number;
	centerY: number;
	rotation: number;
}) {
	const radians = (rotation * Math.PI) / 180;
	const dx = x - centerX;
	const dy = y - centerY;
	return {
		x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
		y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
	};
}

function localPointToSvg(mask: MediaMask, point: { x: number; y: number }) {
	const bounds = scaledMaskBounds(mask);
	return rotatePoint({
		x: bounds.left + point.x * bounds.width,
		y: bounds.top + point.y * bounds.height,
		centerX: bounds.centerX,
		centerY: bounds.centerY,
		rotation: mask.rotation,
	});
}

function penPath(mask: MediaMask, points: MediaMaskPoint[]): string {
	if (points.length < 2) return "";
	const first = localPointToSvg(mask, points[0]);
	const commands = [`M ${first.x} ${first.y}`];
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		const target = localPointToSvg(mask, current);
		if (previous.handleOut || current.handleIn) {
			const control1 = localPointToSvg(mask, previous.handleOut ?? previous);
			const control2 = localPointToSvg(mask, current.handleIn ?? current);
			commands.push(
				`C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${target.x} ${target.y}`
			);
		} else {
			commands.push(`L ${target.x} ${target.y}`);
		}
	}
	commands.push("Z");
	return commands.join(" ");
}

function starPoints(mask: MediaMask): string {
	return Array.from({ length: 10 }, (_, index) => {
		const angle = -Math.PI / 2 + (index * Math.PI) / 5;
		const radius = index % 2 === 0 ? 0.5 : 0.22;
		const point = localPointToSvg(mask, {
			x: 0.5 + Math.cos(angle) * radius,
			y: 0.5 + Math.sin(angle) * radius,
		});
		return `${point.x},${point.y}`;
	}).join(" ");
}

function heartPath(mask: MediaMask): string {
	const points = [
		[0.5, 0.88],
		[0.15, 0.62],
		[0.08, 0.38],
		[0.25, 0.23],
		[0.38, 0.12],
		[0.49, 0.22],
		[0.5, 0.33],
		[0.51, 0.22],
		[0.62, 0.12],
		[0.75, 0.23],
		[0.92, 0.38],
		[0.85, 0.62],
	] as const;
	const [tip, leftEnd, leftTurn, leftTop, leftControl, centerLeft, center] =
		points.map(([x, y]) => localPointToSvg(mask, { x, y }));
	const [centerRight, rightControl, rightTop, rightTurn, rightEnd] = points
		.slice(7)
		.map(([x, y]) => localPointToSvg(mask, { x, y }));
	return [
		`M ${tip.x} ${tip.y}`,
		`C ${leftEnd.x} ${leftEnd.y} ${leftTurn.x} ${leftTurn.y} ${leftTop.x} ${leftTop.y}`,
		`C ${leftControl.x} ${leftControl.y} ${centerLeft.x} ${centerLeft.y} ${center.x} ${center.y}`,
		`C ${centerRight.x} ${centerRight.y} ${rightControl.x} ${rightControl.y} ${rightTop.x} ${rightTop.y}`,
		`C ${rightTurn.x} ${rightTurn.y} ${rightEnd.x} ${rightEnd.y} ${tip.x} ${tip.y}`,
		"Z",
	].join(" ");
}

function buildGradientShape(
	mask: MediaMask,
	index: number
): {
	defs: string;
	shape: string;
} {
	const id = `mask-gradient-${index}`;
	const spread = clamp(mask.feather * SVG_SIZE, 0.1, 49);
	const normalStops =
		mask.type === "mirror"
			? ([
					[0, "black"],
					[50 - spread, "black"],
					[50, "white"],
					[50 + spread, "black"],
					[100, "black"],
				] as const)
			: ([
					[0, "black"],
					[50 - spread, "black"],
					[50 + spread, "white"],
					[100, "white"],
				] as const);
	const stops = normalStops
		.map(([offset, color]) => {
			const resolved = mask.invert
				? color === "white"
					? "black"
					: "white"
				: color;
			return `<stop offset="${offset}%" stop-color="${resolved}"/>`;
		})
		.join("");
	return {
		defs: `<linearGradient id="${id}">${stops}</linearGradient>`,
		shape: `<rect width="100" height="100" fill="url(#${id})" transform="rotate(${mask.rotation} 50 50)"/>`,
	};
}

function buildShape(
	mask: MediaMask,
	index: number
): {
	defs: string;
	shape: string;
	usesOwnInversion: boolean;
} {
	if (mask.type === "linear" || mask.type === "mirror") {
		const gradient = buildGradientShape(mask, index);
		return { ...gradient, usesOwnInversion: true };
	}
	const bounds = scaledMaskBounds(mask);
	const filterId = `mask-feather-${index}`;
	const blur = Math.max(0, mask.feather) * 50;
	const filter = blur > 0 ? ` filter="url(#${filterId})"` : "";
	const defs =
		blur > 0
			? `<filter id="${filterId}"><feGaussianBlur stdDeviation="${blur}"/></filter>`
			: "";
	const fill = mask.invert ? "black" : "white";
	let shape: string;
	if (mask.type === "rectangle") {
		const radius =
			Math.min(bounds.width, bounds.height) * (mask.roundness ?? 0) * 0.5;
		shape = `<rect x="${bounds.left}" y="${bounds.top}" width="${bounds.width}" height="${bounds.height}" rx="${radius}" fill="${fill}" transform="rotate(${mask.rotation} ${bounds.centerX} ${bounds.centerY})"${filter}/>`;
	} else if (mask.type === "ellipse") {
		shape = `<ellipse cx="${bounds.centerX}" cy="${bounds.centerY}" rx="${bounds.width / 2}" ry="${bounds.height / 2}" fill="${fill}" transform="rotate(${mask.rotation} ${bounds.centerX} ${bounds.centerY})"${filter}/>`;
	} else if (mask.type === "star") {
		shape = `<polygon points="${starPoints(mask)}" fill="${fill}"${filter}/>`;
	} else if (mask.type === "heart") {
		shape = `<path d="${heartPath(mask)}" fill="${fill}"${filter}/>`;
	} else if (mask.type === "pen") {
		shape = `<path d="${penPath(mask, mask.points ?? [])}" fill="${fill}"${filter}/>`;
	} else if (mask.type === "text") {
		shape = `<text x="${bounds.centerX}" y="${bounds.centerY}" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(mask.fontFamily ?? "Arial")}" font-weight="${mask.fontWeight ?? "bold"}" font-size="${bounds.height}" fill="${fill}" transform="rotate(${mask.rotation} ${bounds.centerX} ${bounds.centerY})"${filter}>${escapeXml(mask.text ?? "Text")}</text>`;
	} else {
		shape = "";
	}
	return { defs, shape, usesOwnInversion: false };
}

export function buildCombinedMediaMaskSvg(
	inputMasks: MediaMask[],
	customCutout?: Partial<MediaCustomCutout>,
	currentFrame = 0
): string | null {
	const masks = inputMasks
		.map((mask, index) => normalizeMediaMask(mask, index))
		.filter((mask) => mask.enabled && mask.type !== "none");
	const customContent = buildMediaCustomCutoutSvgContent({
		customCutout,
		currentFrame,
	});
	if (masks.length === 0 && !customContent) return null;

	const defs: string[] = [];
	let content = "";
	for (const [index, mask] of masks.entries()) {
		const built = buildShape(mask, index);
		defs.push(built.defs);
		const shapeMaskId = `mask-shape-${index}`;
		const base = mask.invert && !built.usesOwnInversion ? "white" : "black";
		defs.push(
			`<mask id="${shapeMaskId}" maskUnits="userSpaceOnUse"><rect width="100" height="100" fill="black"/><g opacity="${mask.opacity ?? 1}"><rect width="100" height="100" fill="${base}"/>${built.shape}</g></mask>`
		);
		const operation = index === 0 ? "add" : mask.blendMode;
		if (operation === "intersect") {
			content = `<g mask="url(#${shapeMaskId})">${content}</g>`;
		} else {
			content += `<rect width="100" height="100" fill="${operation === "subtract" ? "black" : "white"}" mask="url(#${shapeMaskId})"/>`;
		}
	}
	if (customContent) {
		const customMaskId = "custom-cutout-mask";
		defs.push(
			`<mask id="${customMaskId}" maskUnits="userSpaceOnUse"><rect width="100" height="100" fill="${customContent.baseColor}"/>${customContent.shapes}</mask>`
		);
		content = `<g mask="url(#${customMaskId})">${content || '<rect width="100" height="100" fill="white"/>'}</g>`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs.join("")}</defs><rect width="100" height="100" fill="black"/>${content}</svg>`;
}

export function mediaMaskSvgUrl(
	masks: MediaMask[],
	customCutout?: Partial<MediaCustomCutout>,
	currentFrame = 0
): string | null {
	const svg = buildCombinedMediaMaskSvg(masks, customCutout, currentFrame);
	return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null;
}

export function mediaMaskSvgDataUrl(
	masks: MediaMask[],
	customCutout?: Partial<MediaCustomCutout>,
	currentFrame = 0
): string | null {
	const url = mediaMaskSvgUrl(masks, customCutout, currentFrame);
	return url ? `url("${url}")` : null;
}
