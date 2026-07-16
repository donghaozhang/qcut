import { rgbToASSColor } from "@/lib/captions/subtitle-style";
import { secondsToASSTime } from "@/lib/captions/ass-generator";
import { getCurvedTextTransforms } from "@/lib/text/curved-text";
import {
	getTextAnimationState,
	resolveTextAnimation,
} from "@/lib/text/text-animation";
import { resolveTextKeyframes } from "@/lib/text/text-keyframes";
import { resolveTrackedTextElement } from "@/lib/text/text-tracking";
import { resolveTextStyle } from "@/lib/text/text-style";
import {
	buildTextFont,
	createTextWidthMeasurer,
	measureTextLineWidth,
	wrapTextToWidth,
	type TextWidthMeasurer,
} from "@/lib/text/text-measurement";
import type { TextElement, TimelineTrack } from "@/types/timeline";

export interface TextASSExport {
	content: string;
	renderedElementIds: Set<string>;
}

function assAlpha(opacity: number): string {
	return Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255)
		.toString(16)
		.padStart(2, "0")
		.toUpperCase();
}

function assOverrideColor(hex: string): string {
	const value = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
	return `&H${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}&`.toUpperCase();
}

function escapeASSText(text: string): string {
	// `{` opens an ASS override block and would swallow the following text, so
	// escape it (libass renders `\{` as a literal brace). A bare `}` outside an
	// override block already renders literally and `\}` is not portable, so it
	// stays as-is.
	return text
		.replaceAll("\\", "\\\\")
		.replaceAll("{", "\\{")
		.replace(/\r?\n/g, "\\N");
}

function wrapMeasuredText({
	element,
	measureTextWidth,
}: {
	element: TextElement;
	measureTextWidth?: TextWidthMeasurer;
}): string[] {
	const style = resolveTextStyle(element);
	const usableWidth = Math.max(1, style.width - style.backgroundPadding * 2);
	const font = buildTextFont({
		fontFamily: element.fontFamily,
		fontSize: element.fontSize,
		fontStyle: element.fontStyle,
		fontWeight: element.fontWeight,
	});
	const textWidthMeasurer =
		measureTextWidth ?? createTextWidthMeasurer({ fontSize: element.fontSize });
	return wrapTextToWidth({
		maxWidth: usableWidth,
		measureLineWidth: ({ text }) =>
			measureTextLineWidth({
				font,
				letterSpacing: style.letterSpacing,
				measureTextWidth: textWidthMeasurer,
				text,
			}),
		text: element.content,
	});
}

function getTextAnchor({
	element,
	canvasWidth,
	canvasHeight,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
}): { x: number; y: number; alignment: number } {
	const style = resolveTextStyle(element);
	const centerX = canvasWidth / 2 + element.x;
	const centerY = canvasHeight / 2 + element.y;
	const horizontalIndex =
		element.textAlign === "left" ? 0 : element.textAlign === "right" ? 2 : 1;
	const verticalIndex =
		style.verticalAlign === "top"
			? 2
			: style.verticalAlign === "bottom"
				? 0
				: 1;
	const alignment = verticalIndex * 3 + horizontalIndex + 1;
	const x =
		horizontalIndex === 0
			? centerX - style.width / 2 + style.backgroundPadding
			: horizontalIndex === 2
				? centerX + style.width / 2 - style.backgroundPadding
				: centerX;
	const y =
		verticalIndex === 2
			? centerY - style.height / 2 + style.backgroundPadding
			: verticalIndex === 0
				? centerY + style.height / 2 - style.backgroundPadding
				: centerY;
	return { x, y, alignment };
}

function getStraightLineLayout({
	element,
	canvasWidth,
	canvasHeight,
	measureTextWidth,
}: {
	element: TextElement;
	canvasWidth: number;
	canvasHeight: number;
	measureTextWidth?: TextWidthMeasurer;
}): Array<{ text: string; x: number; y: number; alignment: number }> {
	const style = resolveTextStyle(element);
	const anchor = getTextAnchor({ element, canvasWidth, canvasHeight });
	const lines = wrapMeasuredText({ element, measureTextWidth });
	const lineAdvance = element.fontSize * style.lineHeight;
	return lines.map((text, lineIndex) => {
		let y = anchor.y;
		if (style.verticalAlign === "top") {
			y += lineIndex * lineAdvance;
		} else if (style.verticalAlign === "bottom") {
			y -= (lines.length - 1 - lineIndex) * lineAdvance;
		} else {
			y += (lineIndex - (lines.length - 1) / 2) * lineAdvance;
		}
		return { text, x: anchor.x, y, alignment: anchor.alignment };
	});
}

function motionTags({
	element,
	x,
	y,
	targetOpacity,
}: {
	element: TextElement;
	x: number;
	y: number;
	targetOpacity: number;
}): string {
	const animation = resolveTextAnimation(element);
	const startMs = Math.round(animation.delay * 1000);
	const endMs = Math.round((animation.delay + animation.duration) * 1000);
	let position = `\\pos(${x.toFixed(2)},${y.toFixed(2)})`;
	if (animation.type === "slide-up") {
		position = `\\move(${x.toFixed(2)},${(y + 80).toFixed(2)},${x.toFixed(2)},${y.toFixed(2)},${startMs},${endMs})`;
	} else if (animation.type === "slide-left") {
		position = `\\move(${(x + 120).toFixed(2)},${y.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)},${startMs},${endMs})`;
	}

	const targetAlpha = assAlpha(targetOpacity);
	if (animation.type === "none") {
		return `${position}\\alpha&H${targetAlpha}&`;
	}
	return `${position}\\alpha&HFF&\\t(${startMs},${endMs},\\alpha&H${targetAlpha}&)`;
}

function roundedRectangleDrawing({
	width,
	height,
	radius,
}: {
	width: number;
	height: number;
	radius: number;
}): string {
	const r = Math.min(radius, width / 2, height / 2);
	const k = r * 0.552_284_75;
	return [
		`m ${r} 0`,
		`l ${width - r} 0`,
		`b ${width - r + k} 0 ${width} ${r - k} ${width} ${r}`,
		`l ${width} ${height - r}`,
		`b ${width} ${height - r + k} ${width - r + k} ${height} ${width - r} ${height}`,
		`l ${r} ${height}`,
		`b ${r - k} ${height} 0 ${height - r + k} 0 ${height - r}`,
		`l 0 ${r}`,
		`b 0 ${r - k} ${r - k} 0 ${r} 0`,
	].join(" ");
}

function styleLine(name: string, element: TextElement): string {
	const style = resolveTextStyle(element);
	return [
		name,
		element.fontFamily,
		element.fontSize,
		rgbToASSColor(element.color, 1),
		"&H00FFFFFF",
		rgbToASSColor(style.strokeColor, style.strokeOpacity),
		rgbToASSColor(style.shadowColor, style.shadowOpacity),
		element.fontWeight === "bold" ? -1 : 0,
		element.fontStyle === "italic" ? -1 : 0,
		element.textDecoration === "underline" ? -1 : 0,
		element.textDecoration === "line-through" ? -1 : 0,
		100,
		100,
		style.letterSpacing,
		0,
		1,
		style.strokeWidth,
		0,
		5,
		0,
		0,
		0,
		1,
	].join(",");
}

function eventLine({
	layer,
	start,
	end,
	style,
	text,
}: {
	layer: number;
	start: number;
	end: number;
	style: string;
	text: string;
}): string {
	return `Dialogue: ${layer},${secondsToASSTime(start)},${secondsToASSTime(end)},${style},,0,0,0,,${text}`;
}

function buildElementEvents({
	element,
	index,
	canvasWidth,
	canvasHeight,
	eventStart,
	eventEnd,
	measureTextWidth,
}: {
	element: TextElement;
	index: number;
	canvasWidth: number;
	canvasHeight: number;
	eventStart?: number;
	eventEnd?: number;
	measureTextWidth?: TextWidthMeasurer;
}): { styles: string[]; events: string[] } {
	const style = resolveTextStyle(element);
	const styleName = `QCutText${index}`;
	const start = eventStart ?? element.startTime + element.trimStart;
	const end =
		eventEnd ?? element.startTime + element.duration - element.trimEnd;
	const centerX = canvasWidth / 2 + element.x;
	const centerY = canvasHeight / 2 + element.y;
	const baseTags = `\\org(${centerX.toFixed(2)},${centerY.toFixed(2)})\\frz${-element.rotation}\\fsp${style.letterSpacing}`;
	const styles = [styleLine(styleName, element)];
	const events: string[] = [];

	if (
		style.backgroundOpacity > 0 &&
		element.backgroundColor !== "transparent"
	) {
		const left = canvasWidth / 2 + element.x - style.width / 2;
		const top = canvasHeight / 2 + element.y - style.height / 2;
		const tags = [
			"\\an7\\p1\\bord0\\shad0",
			`\\org(${centerX.toFixed(2)},${centerY.toFixed(2)})\\frz${-element.rotation}`,
			`\\1c${assOverrideColor(element.backgroundColor)}`,
			motionTags({
				element,
				x: left,
				y: top,
				targetOpacity: element.opacity * style.backgroundOpacity,
			}),
		].join("");
		events.push(
			eventLine({
				layer: 0,
				start,
				end,
				style: styleName,
				text: `{${tags}}${roundedRectangleDrawing({
					width: style.width,
					height: style.height,
					radius: style.backgroundRadius,
				})}`,
			})
		);
	}

	// Per-glyph layout for curved text, shared by the main render pass and the
	// shadow/glow passes so effects follow the curve instead of a straight line.
	const getCurvedGlyphLayout = (): Array<{
		text: string;
		x: number;
		y: number;
		anchorTags: string;
	}> => {
		const characters = getCurvedTextTransforms({
			text: element.content,
			width: Math.max(
				1,
				style.width - style.backgroundPadding * 2 - element.fontSize
			),
			curve: style.curve,
		});
		const layout: Array<{
			text: string;
			x: number;
			y: number;
			anchorTags: string;
		}> = [];
		for (const character of characters) {
			if (character.character === " ") continue;
			layout.push({
				text: character.character,
				x: canvasWidth / 2 + element.x + character.x,
				y: canvasHeight / 2 + element.y + character.y,
				anchorTags: `\\an5\\frz${-(element.rotation + character.rotation)}`,
			});
		}
		return layout;
	};

	const getEffectLayout = () =>
		style.curve !== 0
			? getCurvedGlyphLayout()
			: getStraightLineLayout({
					element,
					canvasWidth,
					canvasHeight,
					measureTextWidth,
				}).map((line) => ({
					text: line.text,
					x: line.x,
					y: line.y,
					anchorTags: `\\an${line.alignment}${baseTags}`,
				}));

	const addEffectEvent = ({
		color,
		opacity,
		blur,
		offsetX,
		offsetY,
		border,
	}: {
		color: string;
		opacity: number;
		blur: number;
		offsetX: number;
		offsetY: number;
		border: number;
	}) => {
		if (opacity <= 0) return;
		for (const entry of getEffectLayout()) {
			const tags = [
				entry.anchorTags,
				"\\bord0\\shad0",
				`\\1c${assOverrideColor(color)}`,
				`\\blur${blur}`,
				motionTags({
					element,
					x: entry.x + offsetX,
					y: entry.y + offsetY,
					targetOpacity: element.opacity * opacity,
				}),
				border > 0
					? `\\bord${border}\\1a&HFF&\\3a&H${assAlpha(element.opacity * opacity)}&\\3c${assOverrideColor(color)}`
					: "",
			].join("");
			events.push(
				eventLine({
					layer: 1,
					start,
					end,
					style: styleName,
					text: `{${tags}}${escapeASSText(entry.text)}`,
				})
			);
		}
	};

	addEffectEvent({
		color: style.shadowColor,
		opacity: style.shadowOpacity,
		blur: style.shadowBlur,
		offsetX: style.shadowOffsetX,
		offsetY: style.shadowOffsetY,
		border: 0,
	});
	addEffectEvent({
		color: style.glowColor,
		opacity: style.glowOpacity,
		blur: style.glowBlur,
		offsetX: 0,
		offsetY: 0,
		border: Math.max(1, style.strokeWidth + 2),
	});

	if (style.curve !== 0) {
		for (const glyph of getCurvedGlyphLayout()) {
			const tags = [
				glyph.anchorTags,
				motionTags({
					element,
					x: glyph.x,
					y: glyph.y,
					targetOpacity: element.opacity,
				}),
			].join("");
			events.push(
				eventLine({
					layer: 2,
					start,
					end,
					style: styleName,
					text: `{${tags}}${escapeASSText(glyph.text)}`,
				})
			);
		}
	} else {
		for (const line of getStraightLineLayout({
			element,
			canvasWidth,
			canvasHeight,
			measureTextWidth,
		})) {
			const tags = `\\an${line.alignment}${baseTags}${motionTags({
				element,
				x: line.x,
				y: line.y,
				targetOpacity: element.opacity,
			})}`;
			events.push(
				eventLine({
					layer: 2,
					start,
					end,
					style: styleName,
					text: `{${tags}}${escapeASSText(line.text)}`,
				})
			);
		}
	}

	return { styles, events };
}

export function buildTextASSOverlay({
	tracks,
	allTracks = tracks,
	canvasWidth,
	canvasHeight,
	fps = 30,
	measureTextWidth,
}: {
	tracks: TimelineTrack[];
	allTracks?: TimelineTrack[];
	canvasWidth: number;
	canvasHeight: number;
	fps?: number;
	measureTextWidth?: TextWidthMeasurer;
}): TextASSExport {
	const styles: string[] = [];
	const events: string[] = [];
	const renderedElementIds = new Set<string>();
	let index = 0;

	for (const track of tracks) {
		for (const element of track.elements) {
			if (
				element.type !== "text" ||
				element.hidden ||
				!element.content.trim()
			) {
				continue;
			}

			const hasKeyframes =
				Boolean(element.trackingTargetId) ||
				Object.values(element.keyframes ?? {}).some(
					(keyframes) => (keyframes?.length ?? 0) > 0
				);
			if (hasKeyframes) {
				const visibleStart = element.startTime + element.trimStart;
				const visibleEnd =
					element.startTime + element.duration - element.trimEnd;
				const firstFrame = Math.floor(visibleStart * fps);
				const lastFrame = Math.ceil(visibleEnd * fps);
				for (let frame = firstFrame; frame < lastFrame; frame++) {
					const frameStart = Math.max(visibleStart, frame / fps);
					const frameEnd = Math.min(visibleEnd, (frame + 1) / fps);
					if (frameEnd <= frameStart) continue;
					const resolved = resolveTrackedTextElement({
						element: resolveTextKeyframes(element, frameStart, fps),
						tracks: allTracks,
						currentTime: frameStart,
						fps,
					});
					const animation = getTextAnimationState(element, frameStart);
					const sampled: TextElement = {
						...resolved,
						x: resolved.x + animation.offsetX,
						y: resolved.y + animation.offsetY,
						opacity: resolved.opacity * animation.opacity,
						animationType: "none",
					};
					const result = buildElementEvents({
						element: sampled,
						index: index++,
						canvasWidth,
						canvasHeight,
						eventStart: frameStart,
						eventEnd: frameEnd,
						measureTextWidth,
					});
					styles.push(...result.styles);
					events.push(...result.events);
				}
			} else {
				const result = buildElementEvents({
					element: resolveTrackedTextElement({
						element,
						tracks: allTracks,
						currentTime: element.startTime,
						fps,
					}),
					index: index++,
					canvasWidth,
					canvasHeight,
					measureTextWidth,
				});
				styles.push(...result.styles);
				events.push(...result.events);
			}
			renderedElementIds.add(element.id);
		}
	}

	if (events.length === 0) return { content: "", renderedElementIds };
	const content = [
		"[Script Info]",
		"ScriptType: v4.00+",
		`PlayResX: ${canvasWidth}`,
		`PlayResY: ${canvasHeight}`,
		"ScaledBorderAndShadow: yes",
		"WrapStyle: 0",
		"",
		"[V4+ Styles]",
		"Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
		...styles.map((style) => `Style: ${style}`),
		"",
		"[Events]",
		"Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
		...events,
	].join("\n");
	return { content, renderedElementIds };
}
