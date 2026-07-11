import type { TextElement } from "@/types/timeline";

export const TEXT_BLEND_MODES = [
	"normal",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
] as const;

export interface ResolvedTextStyle {
	width: number;
	height: number;
	letterSpacing: number;
	lineHeight: number;
	verticalAlign: "top" | "middle" | "bottom";
	strokeColor: string;
	strokeWidth: number;
	strokeOpacity: number;
	backgroundOpacity: number;
	backgroundRadius: number;
	backgroundPadding: number;
	shadowColor: string;
	shadowOpacity: number;
	shadowOffsetX: number;
	shadowOffsetY: number;
	shadowBlur: number;
	glowColor: string;
	glowOpacity: number;
	glowBlur: number;
	curve: number;
	blendMode: NonNullable<TextElement["blendMode"]>;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function resolveTextStyle(element: TextElement): ResolvedTextStyle {
	return {
		width: clamp(element.width ?? 640, 40, 7680),
		height: clamp(element.height ?? 180, 40, 4320),
		letterSpacing: clamp(element.letterSpacing ?? 0, -20, 100),
		lineHeight: clamp(element.lineHeight ?? 1.2, 0.5, 5),
		verticalAlign: element.verticalAlign ?? "middle",
		strokeColor: element.strokeColor ?? "#000000",
		strokeWidth: clamp(element.strokeWidth ?? 0, 0, 40),
		strokeOpacity: clamp(element.strokeOpacity ?? 1, 0, 1),
		backgroundOpacity: clamp(
			element.backgroundOpacity ??
				(element.backgroundColor === "transparent" ? 0 : 1),
			0,
			1
		),
		backgroundRadius: clamp(element.backgroundRadius ?? 4, 0, 200),
		backgroundPadding: clamp(element.backgroundPadding ?? 12, 0, 200),
		shadowColor: element.shadowColor ?? "#000000",
		shadowOpacity: clamp(element.shadowOpacity ?? 0, 0, 1),
		shadowOffsetX: clamp(element.shadowOffsetX ?? 4, -200, 200),
		shadowOffsetY: clamp(element.shadowOffsetY ?? 4, -200, 200),
		shadowBlur: clamp(element.shadowBlur ?? 8, 0, 200),
		glowColor: element.glowColor ?? "#ffffff",
		glowOpacity: clamp(element.glowOpacity ?? 0, 0, 1),
		glowBlur: clamp(element.glowBlur ?? 12, 0, 200),
		curve: clamp(element.curve ?? 0, -180, 180),
		blendMode: element.blendMode ?? "normal",
	};
}

export function colorWithOpacity(color: string, opacity: number): string {
	if (color === "transparent" || opacity <= 0) return "transparent";
	const normalized = color.trim();
	const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(normalized);
	const longHex = /^#([\da-f]{6})$/i.exec(normalized);
	const alpha = Math.round(clamp(opacity, 0, 1) * 255)
		.toString(16)
		.padStart(2, "0");

	if (shortHex) {
		return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}${alpha}`;
	}
	if (longHex) return `#${longHex[1]}${alpha}`;
	return normalized;
}

export function buildTextShadow(style: ResolvedTextStyle): string | undefined {
	const shadows: string[] = [];
	if (style.shadowOpacity > 0) {
		shadows.push(
			`${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlur}px ${colorWithOpacity(style.shadowColor, style.shadowOpacity)}`
		);
	}
	if (style.glowOpacity > 0) {
		shadows.push(
			`0 0 ${style.glowBlur}px ${colorWithOpacity(style.glowColor, style.glowOpacity)}`
		);
	}
	return shadows.length > 0 ? shadows.join(", ") : undefined;
}

export function verticalAlignToFlex(
	verticalAlign: ResolvedTextStyle["verticalAlign"]
): "flex-start" | "center" | "flex-end" {
	if (verticalAlign === "top") return "flex-start";
	if (verticalAlign === "bottom") return "flex-end";
	return "center";
}

export function blendModeToCanvas(
	blendMode: ResolvedTextStyle["blendMode"]
): GlobalCompositeOperation {
	return blendMode === "normal" ? "source-over" : blendMode;
}
