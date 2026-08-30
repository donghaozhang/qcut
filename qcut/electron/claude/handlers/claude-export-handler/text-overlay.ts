import type {
	ClaudeElement,
	ClaudeTimeline,
} from "../../../types/claude-api.js";
import { hasJianyingTextStyleCandidate } from "./jianying-text-overlay.js";
import type { TextOverlay } from "./types.js";

// Electron's tsc root cannot import editor-core; mirror DEFAULT_SUBTITLE_STYLE.
const NATIVE_CAPTION_DEFAULTS = {
	fontFamily: "Arial",
	fontSize: 48,
	fontColor: "#ffffff",
	fontOpacity: 1,
	textAlign: "center",
	outlineColor: "#000000",
	outlineWidth: 2,
	backgroundColor: "#000000",
	backgroundOpacity: 0.8,
	shadowColor: "#000000",
	shadowOffsetX: 1,
	shadowOffsetY: 1,
	verticalAlign: "bottom",
	marginV: 90,
	animationDuration: 0.6,
} as const;

function numberValue({
	element,
	style,
	key,
	fallback,
}: {
	element: Record<string, unknown>;
	style: Record<string, unknown>;
	key: string;
	fallback: number;
}): number {
	const value = element[key] ?? style[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue({
	element,
	style,
	key,
	fallback,
}: {
	element: Record<string, unknown>;
	style: Record<string, unknown>;
	key: string;
	fallback: string;
}): string {
	const value = element[key] ?? style[key];
	return typeof value === "string" ? value : fallback;
}

function recordValue({ value }: { value: unknown }): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function booleanValue({
	record,
	key,
	fallback,
}: {
	record: Record<string, unknown>;
	key: string;
	fallback: boolean;
}): boolean {
	return typeof record[key] === "boolean" ? record[key] : fallback;
}

function textAlignValue({
	value,
}: {
	value: unknown;
}): TextOverlay["textAlign"] {
	return value === "left" || value === "right" ? value : "center";
}

function verticalAlignValue({
	value,
}: {
	value: unknown;
}): TextOverlay["verticalAlign"] {
	return value === "top" || value === "center" ? value : "bottom";
}

function animationTypeValue({
	value,
}: {
	value: unknown;
}): TextOverlay["animationType"] {
	return value === "fade" || value === "slide-up" || value === "slide-left"
		? value
		: "none";
}

function collectCaptionOverlay({
	source,
	element,
	style,
	content,
	duration,
}: {
	source: ClaudeElement;
	element: Record<string, unknown>;
	style: Record<string, unknown>;
	content: string;
	duration: number;
}): TextOverlay {
	const position = recordValue({ value: style.position });
	const shadowOffset = recordValue({ value: style.shadowOffset });
	const shadowOffsetX = numberValue({
		element: {},
		style: shadowOffset,
		key: "x",
		fallback: NATIVE_CAPTION_DEFAULTS.shadowOffsetX,
	});
	const shadowOffsetY = numberValue({
		element: {},
		style: shadowOffset,
		key: "y",
		fallback: NATIVE_CAPTION_DEFAULTS.shadowOffsetY,
	});

	return {
		id: source.id,
		content,
		startTime: source.startTime,
		endTime: source.startTime + duration,
		fontSize: numberValue({
			element,
			style,
			key: "fontSize",
			fallback: NATIVE_CAPTION_DEFAULTS.fontSize,
		}),
		fontFamily: stringValue({
			element,
			style,
			key: "fontFamily",
			fallback: NATIVE_CAPTION_DEFAULTS.fontFamily,
		}),
		color: stringValue({
			element,
			style,
			key: "fontColor",
			fallback: NATIVE_CAPTION_DEFAULTS.fontColor,
		}),
		backgroundColor: stringValue({
			element,
			style,
			key: "backgroundColor",
			fallback: NATIVE_CAPTION_DEFAULTS.backgroundColor,
		}),
		textAlign: textAlignValue({ value: style.textAlign }),
		fontWeight: booleanValue({ record: style, key: "bold", fallback: false })
			? "bold"
			: "normal",
		fontStyle: booleanValue({ record: style, key: "italic", fallback: false })
			? "italic"
			: "normal",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: numberValue({
			element: {},
			style,
			key: "fontOpacity",
			fallback: NATIVE_CAPTION_DEFAULTS.fontOpacity,
		}),
		strokeColor: stringValue({
			element: {},
			style,
			key: "outlineColor",
			fallback: NATIVE_CAPTION_DEFAULTS.outlineColor,
		}),
		strokeWidth: numberValue({
			element: {},
			style,
			key: "outlineWidth",
			fallback: NATIVE_CAPTION_DEFAULTS.outlineWidth,
		}),
		strokeOpacity: 1,
		backgroundOpacity: numberValue({
			element: {},
			style,
			key: "bgOpacity",
			fallback: NATIVE_CAPTION_DEFAULTS.backgroundOpacity,
		}),
		shadowColor: stringValue({
			element: {},
			style,
			key: "shadowColor",
			fallback: NATIVE_CAPTION_DEFAULTS.shadowColor,
		}),
		shadowOpacity: shadowOffsetX !== 0 || shadowOffsetY !== 0 ? 1 : 0,
		shadowOffsetX,
		shadowOffsetY,
		positioning: "caption-anchor",
		verticalAlign: verticalAlignValue({ value: position.align }),
		marginV: numberValue({
			element: {},
			style: position,
			key: "y",
			fallback: NATIVE_CAPTION_DEFAULTS.marginV,
		}),
		animationType: animationTypeValue({
			value: stringValue({
				element,
				style,
				key: "animationType",
				fallback: "none",
			}),
		}),
		animationDuration: numberValue({
			element: {},
			style,
			key: "animationDuration",
			fallback: NATIVE_CAPTION_DEFAULTS.animationDuration,
		}),
		animationDelay: numberValue({
			element: {},
			style,
			key: "animationDelay",
			fallback: 0,
		}),
	};
}

function collectCanvasTextOverlay({
	source,
	element,
	style,
	content,
	duration,
}: {
	source: ClaudeElement;
	element: Record<string, unknown>;
	style: Record<string, unknown>;
	content: string;
	duration: number;
}): TextOverlay {
	const textAlign = stringValue({
		element,
		style,
		key: "textAlign",
		fallback: "center",
	});
	const fontWeight = stringValue({
		element,
		style,
		key: "fontWeight",
		fallback: "normal",
	});
	const fontStyle = stringValue({
		element,
		style,
		key: "fontStyle",
		fallback: "normal",
	});
	const backgroundColor = stringValue({
		element,
		style,
		key: "backgroundColor",
		fallback: "transparent",
	});

	return {
		id: source.id,
		content,
		startTime: source.startTime,
		endTime: source.startTime + duration,
		fontSize: numberValue({ element, style, key: "fontSize", fallback: 48 }),
		fontFamily: stringValue({
			element,
			style,
			key: "fontFamily",
			fallback: "Arial",
		}),
		color: stringValue({
			element,
			style,
			key: "color",
			fallback: "#ffffff",
		}),
		backgroundColor,
		textAlign: textAlignValue({ value: textAlign }),
		fontWeight: fontWeight === "bold" ? "bold" : "normal",
		fontStyle: fontStyle === "italic" ? "italic" : "normal",
		x: numberValue({ element, style, key: "x", fallback: 0 }),
		y: numberValue({ element, style, key: "y", fallback: 0 }),
		rotation: numberValue({ element, style, key: "rotation", fallback: 0 }),
		opacity: numberValue({ element, style, key: "opacity", fallback: 1 }),
		strokeColor: stringValue({
			element,
			style,
			key: "strokeColor",
			fallback: "#000000",
		}),
		strokeWidth: numberValue({
			element,
			style,
			key: "strokeWidth",
			fallback: 0,
		}),
		strokeOpacity: numberValue({
			element,
			style,
			key: "strokeOpacity",
			fallback: 1,
		}),
		backgroundOpacity: numberValue({
			element,
			style,
			key: "backgroundOpacity",
			fallback: backgroundColor === "transparent" ? 0 : 1,
		}),
		shadowColor: stringValue({
			element,
			style,
			key: "shadowColor",
			fallback: "#000000",
		}),
		shadowOpacity: numberValue({
			element,
			style,
			key: "shadowOpacity",
			fallback: 0,
		}),
		shadowOffsetX: numberValue({
			element,
			style,
			key: "shadowOffsetX",
			fallback: 0,
		}),
		shadowOffsetY: numberValue({
			element,
			style,
			key: "shadowOffsetY",
			fallback: 0,
		}),
		positioning: "canvas-offset",
		verticalAlign: "center",
		marginV: 0,
		animationType: animationTypeValue({
			value: stringValue({
				element,
				style,
				key: "animationType",
				fallback: "none",
			}),
		}),
		animationDuration: numberValue({
			element,
			style,
			key: "animationDuration",
			fallback: 0.5,
		}),
		animationDelay: numberValue({
			element,
			style,
			key: "animationDelay",
			fallback: 0,
		}),
	};
}

/** Collect text-like timeline elements for the native FFmpeg overlay pass. */
export function collectTextOverlays(timeline: ClaudeTimeline): TextOverlay[] {
	const overlays: TextOverlay[] = [];
	for (const track of timeline.tracks) {
		if (track.hidden) continue;
		for (const source of track.elements) {
			if (
				source.hidden ||
				!["text", "captions", "markdown"].includes(source.type) ||
				hasJianyingTextStyleCandidate({ source })
			) {
				continue;
			}
			const element = source as unknown as Record<string, unknown>;
			const style = (source.style ?? {}) as Record<string, unknown>;
			const content =
				typeof source.content === "string"
					? source.content
					: typeof element.text === "string"
						? element.text
						: source.markdownContent;
			if (!content?.trim()) continue;
			const duration =
				typeof source.duration === "number" && source.duration > 0
					? source.duration
					: source.endTime - source.startTime;
			if (!Number.isFinite(duration) || duration <= 0) continue;

			overlays.push(
				source.type === "captions"
					? collectCaptionOverlay({
							source,
							element,
							style,
							content,
							duration,
						})
					: collectCanvasTextOverlay({
							source,
							element,
							style,
							content,
							duration,
						})
			);
		}
	}
	return overlays.sort((left, right) => left.startTime - right.startTime);
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function assColor(hex: string, opacity: number): string {
	const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "ffffff";
	const alpha = Math.round((1 - clamp01(opacity)) * 255)
		.toString(16)
		.padStart(2, "0")
		.toUpperCase();
	return `&H${alpha}${normalized.slice(4, 6)}${normalized.slice(2, 4)}${normalized.slice(0, 2)}`.toUpperCase();
}

function assTime(seconds: number): string {
	const safe = Math.max(0, seconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const remainder = safe % 60;
	return `${hours}:${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function escapeAssText(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/{/g, "\\{")
		.replace(/}/g, "\\}")
		.replace(/\r?\n/g, "\\N");
}

const ASS_ALIGNMENTS = {
	top: { left: 7, center: 8, right: 9 },
	center: { left: 4, center: 5, right: 6 },
	bottom: { left: 1, center: 2, right: 3 },
} as const;

/** CJK ideographs/kana/hangul plus full-width forms. */
const CJK_PATTERN = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

/**
 * Pick an ASS font family that can actually render the overlay content.
 *
 * On macOS libass asks CoreText for a CJK fallback and gets pointed at the
 * reserved PingFangUI.ttc, which third-party processes cannot open — every
 * CJK glyph then renders as an empty box. Naming an openable CJK family in
 * the style is the only reliable path, so CJK content overrides the
 * requested (Latin) family. Latin-only content keeps the element's font.
 */
function assFontFamily(overlay: TextOverlay): string {
	const requested = overlay.fontFamily.replace(/,/g, " ");
	if (!CJK_PATTERN.test(overlay.content)) return requested;
	if (process.platform === "darwin") return "Hiragino Sans GB";
	if (process.platform === "win32") return "Microsoft YaHei";
	return "Noto Sans CJK SC";
}

function overlayAnchor({
	overlay,
	width,
	height,
}: {
	overlay: TextOverlay;
	width: number;
	height: number;
}): { x: number; y: number } {
	if (overlay.positioning === "canvas-offset") {
		return { x: width / 2 + overlay.x, y: height / 2 + overlay.y };
	}
	const x =
		overlay.textAlign === "left"
			? width * 0.1
			: overlay.textAlign === "right"
				? width * 0.9
				: width / 2;
	const y =
		overlay.verticalAlign === "top"
			? overlay.marginV
			: overlay.verticalAlign === "center"
				? height / 2
				: height - overlay.marginV;
	return { x, y };
}

/** Build an ASS subtitle document that preserves core QCut text styling. */
export function buildTextAss({
	overlays,
	width,
	height,
}: {
	overlays: TextOverlay[];
	width: number;
	height: number;
}): string {
	const styles: string[] = [];
	const events: string[] = [];
	for (const [index, overlay] of overlays.entries()) {
		const styleName = `QCutText${index}`;
		const alignment =
			ASS_ALIGNMENTS[
				overlay.positioning === "caption-anchor"
					? overlay.verticalAlign
					: "center"
			][overlay.textAlign];
		const backgroundEnabled =
			overlay.backgroundColor !== "transparent" &&
			overlay.backgroundOpacity > 0;
		styles.push(
			[
				styleName,
				assFontFamily(overlay),
				overlay.fontSize,
				assColor(overlay.color, overlay.opacity),
				assColor(overlay.color, overlay.opacity),
				assColor(overlay.strokeColor, overlay.strokeOpacity * overlay.opacity),
				assColor(
					backgroundEnabled ? overlay.backgroundColor : overlay.shadowColor,
					backgroundEnabled
						? overlay.backgroundOpacity * overlay.opacity
						: overlay.shadowOpacity * overlay.opacity
				),
				overlay.fontWeight === "bold" ? -1 : 0,
				overlay.fontStyle === "italic" ? -1 : 0,
				0,
				0,
				100,
				100,
				0,
				0,
				backgroundEnabled ? 3 : 1,
				overlay.strokeWidth,
				Math.max(
					Math.abs(overlay.shadowOffsetX),
					Math.abs(overlay.shadowOffsetY)
				),
				alignment,
				0,
				0,
				overlay.positioning === "caption-anchor"
					? Math.max(0, Math.round(overlay.marginV))
					: 0,
				1,
			].join(",")
		);

		const { x, y } = overlayAnchor({ overlay, width, height });
		const animationStart = Math.max(0, overlay.animationDelay * 1000);
		const animationEnd = Math.max(
			animationStart,
			(overlay.animationDelay + overlay.animationDuration) * 1000
		);
		let motion =
			overlay.positioning === "canvas-offset"
				? `\\pos(${x.toFixed(2)},${y.toFixed(2)})`
				: "";
		if (overlay.animationType === "slide-up") {
			motion = `\\move(${x.toFixed(2)},${(y + 80).toFixed(2)},${x.toFixed(2)},${y.toFixed(2)},${animationStart.toFixed(0)},${animationEnd.toFixed(0)})`;
		} else if (overlay.animationType === "slide-left") {
			motion = `\\move(${(x + 120).toFixed(2)},${y.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)},${animationStart.toFixed(0)},${animationEnd.toFixed(0)})`;
		}
		const fade =
			overlay.animationType === "fade"
				? `\\fad(${Math.max(1, overlay.animationDuration * 1000).toFixed(0)},0)`
				: "";
		const tags = `${motion}\\frz${(-overlay.rotation).toFixed(2)}${fade}`;
		events.push(
			`Dialogue: 0,${assTime(overlay.startTime)},${assTime(overlay.endTime)},${styleName},,0,0,0,,{${tags}}${escapeAssText(overlay.content)}`
		);
	}

	return [
		"[Script Info]",
		"ScriptType: v4.00+",
		`PlayResX: ${width}`,
		`PlayResY: ${height}`,
		"ScaledBorderAndShadow: yes",
		"WrapStyle: 2",
		"",
		"[V4+ Styles]",
		"Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
		...styles.map((style) => `Style: ${style}`),
		"",
		"[Events]",
		"Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
		...events,
		"",
	].join("\n");
}
