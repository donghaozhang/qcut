import type { ClaudeTimeline } from "../../../types/claude-api.js";
import { hasJianyingTextStyleCandidate } from "./jianying-text-overlay.js";
import type { TextOverlay } from "./types.js";

function numberValue(
	element: Record<string, unknown>,
	style: Record<string, unknown>,
	key: string,
	fallback: number
): number {
	const value = element[key] ?? style[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(
	element: Record<string, unknown>,
	style: Record<string, unknown>,
	key: string,
	fallback: string
): string {
	const value = element[key] ?? style[key];
	return typeof value === "string" ? value : fallback;
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
					: source.markdownContent;
			if (!content?.trim()) continue;
			const duration =
				typeof source.duration === "number" && source.duration > 0
					? source.duration
					: source.endTime - source.startTime;
			if (!Number.isFinite(duration) || duration <= 0) continue;

			const textAlign = stringValue(element, style, "textAlign", "center");
			const fontWeight = stringValue(element, style, "fontWeight", "normal");
			const fontStyle = stringValue(element, style, "fontStyle", "normal");
			const animationType = stringValue(
				element,
				style,
				"animationType",
				"none"
			);
			overlays.push({
				id: source.id,
				content,
				startTime: source.startTime,
				endTime: source.startTime + duration,
				fontSize: numberValue(element, style, "fontSize", 48),
				fontFamily: stringValue(element, style, "fontFamily", "Arial"),
				color: stringValue(element, style, "color", "#ffffff"),
				backgroundColor: stringValue(
					element,
					style,
					"backgroundColor",
					"transparent"
				),
				textAlign:
					textAlign === "left" || textAlign === "right" ? textAlign : "center",
				fontWeight: fontWeight === "bold" ? "bold" : "normal",
				fontStyle: fontStyle === "italic" ? "italic" : "normal",
				x: numberValue(element, style, "x", 0),
				y: numberValue(element, style, "y", 0),
				rotation: numberValue(element, style, "rotation", 0),
				opacity: numberValue(element, style, "opacity", 1),
				strokeColor: stringValue(element, style, "strokeColor", "#000000"),
				strokeWidth: numberValue(element, style, "strokeWidth", 0),
				strokeOpacity: numberValue(element, style, "strokeOpacity", 1),
				backgroundOpacity: numberValue(
					element,
					style,
					"backgroundOpacity",
					source.backgroundColor === "transparent" ? 0 : 1
				),
				shadowColor: stringValue(element, style, "shadowColor", "#000000"),
				shadowOpacity: numberValue(element, style, "shadowOpacity", 0),
				shadowOffsetX: numberValue(element, style, "shadowOffsetX", 0),
				shadowOffsetY: numberValue(element, style, "shadowOffsetY", 0),
				animationType:
					animationType === "fade" ||
					animationType === "slide-up" ||
					animationType === "slide-left"
						? animationType
						: "none",
				animationDuration: numberValue(
					element,
					style,
					"animationDuration",
					0.5
				),
				animationDelay: numberValue(element, style, "animationDelay", 0),
			});
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

/** ASS \an alignment codes for middle-row left/center/right text. */
const ASS_MIDDLE_ALIGNMENTS = { left: 4, center: 5, right: 6 } as const;

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
		const alignment = ASS_MIDDLE_ALIGNMENTS[overlay.textAlign];
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
				0,
				1,
			].join(",")
		);

		const x = width / 2 + overlay.x;
		const y = height / 2 + overlay.y;
		const animationStart = Math.max(0, overlay.animationDelay * 1000);
		const animationEnd = Math.max(
			animationStart,
			(overlay.animationDelay + overlay.animationDuration) * 1000
		);
		let motion = `\\pos(${x.toFixed(2)},${y.toFixed(2)})`;
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
