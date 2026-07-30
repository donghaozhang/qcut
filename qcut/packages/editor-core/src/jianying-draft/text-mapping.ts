import { resolveSubtitleStyle } from "../captions/subtitle-style.js";
import type {
	CaptionElement,
	SubtitleStyle,
	TextElement,
} from "../types/timeline.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import {
	parseJianyingTextColor,
	type JianyingTextColor,
} from "./text-color.js";
import { secondsToMicroseconds } from "./time.js";
import type { JianyingDraftSegment, JianyingTextMaterial } from "./types.js";

interface TextStroke {
	alpha: number;
	color: JianyingTextColor;
	width: number;
}

interface TextBackground {
	alpha: number;
	color: JianyingTextColor;
	height: number;
	roundRadius: number;
	width: number;
}

interface TextShadow {
	alpha: number;
	angle: number;
	color: JianyingTextColor;
	diffuse: number;
	distance: number;
}

interface TextMappingStyle {
	alignment: 0 | 1 | 2;
	background: TextBackground | null;
	bold: boolean;
	fill: JianyingTextColor;
	fontSize: number;
	globalAlpha: number;
	italic: boolean;
	letterSpacing: number;
	lineMaxWidth: number;
	shadow: TextShadow | null;
	stroke: TextStroke | null;
	underline: boolean;
}

interface TextPosition {
	rotation: number;
	x: number;
	y: number;
}

const JIANYING_TEXT_SIZE_REFERENCE_HEIGHT = 135;

export interface MappedTextElement {
	material: JianyingTextMaterial;
	segment: JianyingDraftSegment;
}

function requiredColor({
	fallback,
	value,
}: {
	fallback: string;
	value: string;
}): JianyingTextColor {
	return (
		parseJianyingTextColor({ value }) ??
		(parseJianyingTextColor({ value: fallback }) as JianyingTextColor)
	);
}

function clamp({
	maximum,
	minimum,
	value,
}: {
	maximum: number;
	minimum: number;
	value: number;
}): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function mapAlignment({
	alignment,
}: {
	alignment: "left" | "center" | "right";
}): 0 | 1 | 2 {
	if (alignment === "left") return 0;
	if (alignment === "right") return 2;
	return 1;
}

function utf16CodeUnitLength({ value }: { value: string }): number {
	return value.length;
}

function mapCanvasFontSize({
	canvasHeight,
	fontSize,
}: {
	canvasHeight: number;
	fontSize: number;
}): number {
	// CapCut size 8 matches 64 canvas pixels at 1080p.
	return (fontSize * JIANYING_TEXT_SIZE_REFERENCE_HEIGHT) / canvasHeight;
}

function createStrokeJson({ stroke }: { stroke: TextStroke }) {
	return {
		content: {
			solid: {
				alpha: stroke.alpha,
				color: stroke.color.rgb,
			},
		},
		width: stroke.width,
	};
}

function createShadowJson({ shadow }: { shadow: TextShadow }) {
	return {
		alpha: shadow.alpha,
		angle: shadow.angle,
		content: {
			solid: {
				color: shadow.color.rgb,
			},
		},
		diffuse: shadow.diffuse,
		distance: shadow.distance,
	};
}

function buildTextContent({
	style,
	text,
}: {
	style: TextMappingStyle;
	text: string;
}): string {
	return JSON.stringify({
		styles: [
			{
				bold: style.bold,
				fill: {
					alpha: 1,
					content: {
						render_type: "solid",
						solid: {
							alpha: style.fill.alpha,
							color: style.fill.rgb,
						},
					},
				},
				italic: style.italic,
				range: [0, utf16CodeUnitLength({ value: text })],
				shadows: style.shadow
					? [createShadowJson({ shadow: style.shadow })]
					: [],
				size: style.fontSize,
				strokes: style.stroke
					? [createStrokeJson({ stroke: style.stroke })]
					: [],
				underline: style.underline,
			},
		],
		text,
	});
}

function createTextMaterial({
	elementId,
	style,
	text,
	type,
}: {
	elementId: string;
	style: TextMappingStyle;
	text: string;
	type: JianyingTextMaterial["type"];
}): JianyingTextMaterial {
	const checkFlag =
		7 +
		(style.stroke ? 8 : 0) +
		(style.background ? 16 : 0) +
		(style.shadow ? 32 : 0);
	const backgroundFields = style.background
		? {
				background_alpha: style.background.alpha,
				background_color: style.background.color.hex,
				background_height: style.background.height,
				background_horizontal_offset: 0,
				background_round_radius: style.background.roundRadius,
				background_style: 1 as const,
				background_vertical_offset: 0,
				background_width: style.background.width,
			}
		: {};

	return {
		alignment: style.alignment,
		check_flag: checkFlag,
		content: buildTextContent({ style, text }),
		fixed_height: -1,
		fixed_width: -1,
		font_size: style.fontSize,
		force_apply_line_max_width: type === "text",
		global_alpha: style.globalAlpha,
		id: createDeterministicJianyingId({
			namespace: "text-material",
			sourceId: elementId,
		}),
		letter_spacing: style.letterSpacing * 0.05,
		line_feed: 1,
		line_max_width: style.lineMaxWidth,
		line_spacing: 0.02,
		text_color: style.fill.hex,
		type,
		typesetting: 0,
		...backgroundFields,
	};
}

function createTextSegment({
	duration,
	elementId,
	materialId,
	position,
	startTime,
}: {
	duration: number;
	elementId: string;
	materialId: string;
	position: TextPosition;
	startTime: number;
}): JianyingDraftSegment {
	const durationMicroseconds = secondsToMicroseconds({ seconds: duration });
	return {
		clip: {
			alpha: 1,
			flip: { horizontal: false, vertical: false },
			rotation: position.rotation,
			scale: { x: 1, y: 1 },
			transform: { x: position.x, y: position.y },
		},
		common_keyframes: [],
		enable_adjust: true,
		enable_color_correct_adjust: false,
		enable_color_curves: true,
		enable_color_match_adjust: false,
		enable_color_wheels: true,
		enable_lut: true,
		enable_smart_color_adjust: false,
		extra_material_refs: [],
		hdr_settings: null,
		id: createDeterministicJianyingId({
			namespace: "segment",
			sourceId: elementId,
		}),
		is_tone_modify: false,
		keyframe_refs: [],
		last_nonzero_volume: 1,
		material_id: materialId,
		render_index: 0,
		reverse: false,
		source_timerange: { duration: durationMicroseconds, start: 0 },
		speed: 1,
		target_timerange: {
			duration: durationMicroseconds,
			start: secondsToMicroseconds({ seconds: startTime }),
		},
		track_attribute: 0,
		track_render_index: 0,
		visible: true,
		volume: 1,
	};
}

function createTextElementStyle({
	canvasHeight,
	canvasWidth,
	element,
}: {
	canvasHeight: number;
	canvasWidth: number;
	element: TextElement;
}): TextMappingStyle {
	const fill = requiredColor({ fallback: "#ffffff", value: element.color });
	const canvasFontSize = element.fontSize;
	const strokeColor = requiredColor({
		fallback: "#000000",
		value: element.strokeColor ?? "#000000",
	});
	const strokeOpacity = element.strokeOpacity ?? 1;
	const strokeWidth = element.strokeWidth ?? 0;
	const backgroundColor = requiredColor({
		fallback: "#000000",
		value: element.backgroundColor,
	});
	const backgroundOpacity =
		element.backgroundOpacity ??
		(element.backgroundColor === "transparent" ? 0 : 1);
	const shadowColor = requiredColor({
		fallback: "#000000",
		value: element.shadowColor ?? "#000000",
	});
	const shadowOpacity = element.shadowOpacity ?? 0;
	const shadowOffsetX = element.shadowOffsetX ?? 4;
	const shadowOffsetY = element.shadowOffsetY ?? 4;
	const shadowDistance = Math.hypot(shadowOffsetX, shadowOffsetY);

	return {
		alignment: mapAlignment({ alignment: element.textAlign }),
		background:
			backgroundOpacity > 0 && backgroundColor.alpha > 0
				? {
						alpha: backgroundOpacity * backgroundColor.alpha,
						color: backgroundColor,
						height: clamp({
							maximum: 1,
							minimum: 0,
							value: (element.backgroundPadding ?? 12) / canvasFontSize,
						}),
						roundRadius: clamp({
							maximum: 1,
							minimum: 0,
							value: (element.backgroundRadius ?? 4) / canvasFontSize,
						}),
						width: clamp({
							maximum: 1,
							minimum: 0,
							value: (element.backgroundPadding ?? 12) / canvasFontSize,
						}),
					}
				: null,
		bold: element.fontWeight === "bold",
		fill,
		fontSize: mapCanvasFontSize({
			canvasHeight,
			fontSize: canvasFontSize,
		}),
		globalAlpha: element.opacity,
		italic: element.fontStyle === "italic",
		letterSpacing: element.letterSpacing ?? 0,
		lineMaxWidth: clamp({
			maximum: 1,
			minimum: 0.01,
			value: (element.width ?? canvasWidth * 0.82) / canvasWidth,
		}),
		shadow:
			shadowOpacity > 0 && shadowColor.alpha > 0
				? {
						alpha: shadowOpacity * shadowColor.alpha,
						angle: (Math.atan2(shadowOffsetY, shadowOffsetX) * 180) / Math.PI,
						color: shadowColor,
						diffuse: clamp({
							maximum: 1,
							minimum: 0,
							value: (element.shadowBlur ?? 8) / canvasFontSize / 6,
						}),
						distance: shadowDistance,
					}
				: null,
		stroke:
			strokeWidth > 0 && strokeOpacity > 0 && strokeColor.alpha > 0
				? {
						alpha: strokeOpacity * strokeColor.alpha,
						color: strokeColor,
						width: strokeWidth / canvasFontSize,
					}
				: null,
		underline: element.textDecoration === "underline",
	};
}

function createCaptionStyle({
	canvasHeight,
	element,
}: {
	canvasHeight: number;
	element: CaptionElement;
}): {
	mappingStyle: TextMappingStyle;
	resolvedStyle: SubtitleStyle;
} {
	const resolvedStyle = resolveSubtitleStyle(element.style);
	const fill = requiredColor({
		fallback: "#ffffff",
		value: resolvedStyle.fontColor,
	});
	const outline = requiredColor({
		fallback: "#000000",
		value: resolvedStyle.outlineColor,
	});
	const background = requiredColor({
		fallback: "#000000",
		value: resolvedStyle.backgroundColor,
	});
	const shadow = requiredColor({
		fallback: "#000000",
		value: resolvedStyle.shadowColor,
	});
	const shadowDistance = Math.hypot(
		resolvedStyle.shadowOffset.x,
		resolvedStyle.shadowOffset.y
	);
	const canvasFontSize = resolvedStyle.fontSize;
	return {
		mappingStyle: {
			alignment: mapAlignment({ alignment: resolvedStyle.textAlign }),
			background:
				resolvedStyle.bgOpacity > 0 && background.alpha > 0
					? {
							alpha: resolvedStyle.bgOpacity * background.alpha,
							color: background,
							height: clamp({
								maximum: 1,
								minimum: 0,
								value: 8 / canvasFontSize,
							}),
							roundRadius: clamp({
								maximum: 1,
								minimum: 0,
								value: 4 / canvasFontSize,
							}),
							width: clamp({
								maximum: 1,
								minimum: 0,
								value: 16 / canvasFontSize,
							}),
						}
					: null,
			bold: resolvedStyle.bold,
			fill,
			fontSize: mapCanvasFontSize({
				canvasHeight,
				fontSize: canvasFontSize,
			}),
			globalAlpha: resolvedStyle.fontOpacity,
			italic: resolvedStyle.italic,
			letterSpacing: resolvedStyle.letterSpacing,
			lineMaxWidth: 0.82,
			shadow:
				shadowDistance > 0 && shadow.alpha > 0
					? {
							alpha: shadow.alpha,
							angle:
								(Math.atan2(
									resolvedStyle.shadowOffset.y,
									resolvedStyle.shadowOffset.x
								) *
									180) /
								Math.PI,
							color: shadow,
							diffuse: 2 / canvasFontSize / 6,
							distance: shadowDistance,
						}
					: null,
			stroke:
				resolvedStyle.outlineWidth > 0 && outline.alpha > 0
					? {
							alpha: outline.alpha,
							color: outline,
							width: resolvedStyle.outlineWidth / canvasFontSize,
						}
					: null,
			underline: resolvedStyle.underline,
		},
		resolvedStyle,
	};
}

export function mapTextElementToJianying({
	canvasHeight,
	canvasWidth,
	element,
}: {
	canvasHeight: number;
	canvasWidth: number;
	element: TextElement;
}): MappedTextElement {
	const style = createTextElementStyle({
		canvasHeight,
		canvasWidth,
		element,
	});
	const material = createTextMaterial({
		elementId: element.id,
		style,
		text: element.content,
		type: "text",
	});
	return {
		material,
		segment: createTextSegment({
			duration: element.duration - element.trimStart - element.trimEnd,
			elementId: element.id,
			materialId: material.id,
			position: {
				rotation: element.rotation,
				x: (2 * element.x) / canvasWidth,
				y: (-2 * element.y) / canvasHeight,
			},
			startTime: element.startTime,
		}),
	};
}

export function mapCaptionElementToJianying({
	canvasHeight,
	element,
}: {
	canvasHeight: number;
	element: CaptionElement;
}): MappedTextElement {
	const { mappingStyle, resolvedStyle } = createCaptionStyle({
		canvasHeight,
		element,
	});
	const material = createTextMaterial({
		elementId: element.id,
		style: mappingStyle,
		text: element.text,
		type: "subtitle",
	});
	return {
		material,
		segment: createTextSegment({
			duration: element.duration - element.trimStart - element.trimEnd,
			elementId: element.id,
			materialId: material.id,
			position: {
				rotation: element.rotation ?? 0,
				x: (resolvedStyle.position.x - 50) / 50,
				y: (50 - resolvedStyle.position.y) / 50,
			},
			startTime: element.startTime,
		}),
	};
}
