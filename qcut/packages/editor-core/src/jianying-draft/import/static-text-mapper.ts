import type { InteropCapability } from "../../draft-interop/capability.js";
import type {
	InteropText,
	InteropTextBackground,
	InteropTextShadow,
	InteropTextStroke,
} from "../../draft-interop/document.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import { parseJianyingTextColor } from "../text-color.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";

const TEXT_SIZE_REFERENCE_HEIGHT = 135;
const MAX_TEXT_CONTENT_BYTES = 1_048_576;

export interface MapStaticTextInput {
	profileId: string;
	canvasWidth: number;
	canvasHeight: number;
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
	graph?: RawDraftGraph;
}

export interface MappedStaticText {
	capability: InteropCapability;
	issueCode: InteropIssueCode;
	reason: string;
	text?: InteropText;
}

export type MapCapCut81StaticTextInput = MapStaticTextInput;
export type MappedCapCut81StaticText = MappedStaticText;

interface StaticTextProfilePolicy {
	allowMissingDecorationArrays: boolean;
	allowNoopAnimationRefs: boolean;
	reason: string;
}

interface ParsedSolidColor {
	color: string;
	opacity: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFinite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function readUnit(value: unknown): number | undefined {
	const parsed = readFinite(value);
	return parsed !== undefined && parsed >= 0 && parsed <= 1
		? parsed
		: undefined;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function byteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function roundCanvasValue(value: number): number {
	const rounded = Math.round(value * 1_000_000) / 1_000_000;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function channelToHex(value: number): string {
	return Math.round(value * 255)
		.toString(16)
		.padStart(2, "0");
}

function parseRgbVector(value: unknown): string | undefined {
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		!value.every(
			(channel) =>
				typeof channel === "number" &&
				Number.isFinite(channel) &&
				channel >= 0 &&
				channel <= 1
		)
	) {
		return undefined;
	}
	return `#${value.map(channelToHex).join("")}`;
}

function parseSolidColor({
	value,
	outerAlpha = 1,
}: {
	value: unknown;
	outerAlpha?: number;
}): ParsedSolidColor | undefined {
	if (!isRecord(value)) return undefined;
	const content = isRecord(value.content) ? value.content : undefined;
	const solid = content && isRecord(content.solid) ? content.solid : undefined;
	const color = parseRgbVector(solid?.color);
	const innerAlpha = readUnit(solid?.alpha) ?? 1;
	const containerAlpha = readUnit(value.alpha) ?? 1;
	if (color === undefined) return undefined;
	return {
		color,
		opacity: outerAlpha * containerAlpha * innerAlpha,
	};
}

function parseFallbackColor(value: unknown): ParsedSolidColor | undefined {
	const raw = readString(value);
	if (raw === undefined) return undefined;
	const parsed = parseJianyingTextColor({ value: raw });
	return parsed === null
		? undefined
		: { color: parsed.hex, opacity: parsed.alpha };
}

function blocked(reason: string): MappedStaticText {
	return {
		capability: "blocked",
		issueCode: "FEATURE_OPAQUE",
		reason,
	};
}

function opaque(reason: string): MappedStaticText {
	return {
		capability: "opaque",
		issueCode: "FEATURE_OPAQUE",
		reason,
	};
}

function resolveProfilePolicy({
	profileId,
}: {
	profileId: string;
}): StaticTextProfilePolicy | undefined {
	if (profileId === CAPCUT_8_1_PROFILE_ID) {
		return {
			allowMissingDecorationArrays: false,
			allowNoopAnimationRefs: false,
			reason:
				"static text imported without a real CapCut 8.1 render receipt; system font substitution may differ",
		};
	}
	if (profileId === JIANYING_11_3_BETA4_PROFILE_ID) {
		return {
			allowMissingDecorationArrays: true,
			allowNoopAnimationRefs: true,
			reason:
				"static text imported from a Jianying 11.3 beta4 creation-time subdraft; system font substitution and stale subdraft ownership may differ from the live project",
		};
	}
	return undefined;
}

function hasOnlyAllowedExtraRefs({
	graph,
	policy,
	segment,
}: {
	graph: RawDraftGraph | undefined;
	policy: StaticTextProfilePolicy;
	segment: RawGraphSegmentNode;
}): boolean {
	if (segment.extraMaterialRefs.length === 0) return true;
	if (!policy.allowNoopAnimationRefs || graph === undefined) return false;
	for (const ref of segment.extraMaterialRefs) {
		const material = graph.materialsById.get(ref);
		if (
			material?.bucket !== "material_animations" ||
			!Array.isArray(material.raw.animations) ||
			material.raw.animations.length !== 0
		) {
			return false;
		}
	}
	return true;
}

function parseStroke({
	allowMissingDecorationArrays,
	style,
	fontSizePx,
}: {
	allowMissingDecorationArrays: boolean;
	style: Record<string, unknown>;
	fontSizePx: number;
}): InteropTextStroke | null | undefined {
	if (!Array.isArray(style.strokes)) {
		return allowMissingDecorationArrays ? null : undefined;
	}
	if (style.strokes.length === 0) return null;
	if (style.strokes.length !== 1 || !isRecord(style.strokes[0])) {
		return undefined;
	}
	const solid = parseSolidColor({ value: style.strokes[0] });
	const width = readFinite(style.strokes[0].width);
	if (solid === undefined || width === undefined || width < 0) return undefined;
	return {
		color: solid.color,
		widthPx: roundCanvasValue(width * fontSizePx),
		opacity: solid.opacity,
	};
}

function parseShadow({
	allowMissingDecorationArrays,
	style,
	fontSizePx,
}: {
	allowMissingDecorationArrays: boolean;
	style: Record<string, unknown>;
	fontSizePx: number;
}): InteropTextShadow | null | undefined {
	if (!Array.isArray(style.shadows)) {
		return allowMissingDecorationArrays ? null : undefined;
	}
	if (style.shadows.length === 0) return null;
	if (style.shadows.length !== 1 || !isRecord(style.shadows[0])) {
		return undefined;
	}
	const shadow = style.shadows[0];
	const solid = parseSolidColor({ value: shadow });
	const angle = readFinite(shadow.angle);
	const diffuse = readFinite(shadow.diffuse);
	const distance = readFinite(shadow.distance);
	if (
		solid === undefined ||
		angle === undefined ||
		diffuse === undefined ||
		diffuse < 0 ||
		distance === undefined ||
		distance < 0
	) {
		return undefined;
	}
	const angleRadians = (angle * Math.PI) / 180;
	return {
		color: solid.color,
		opacity: solid.opacity,
		offsetXPx: roundCanvasValue(Math.cos(angleRadians) * distance),
		offsetYPx: roundCanvasValue(Math.sin(angleRadians) * distance),
		blurPx: roundCanvasValue(diffuse * fontSizePx * 6),
	};
}

function parseBackground({
	material,
	fontSizePx,
}: {
	material: Record<string, unknown>;
	fontSizePx: number;
}): InteropTextBackground | null | undefined {
	if (
		material.background_style === undefined ||
		material.background_style === 0
	) {
		return null;
	}
	if (material.background_style !== 1) return undefined;
	const color = parseFallbackColor(material.background_color);
	const opacity = readUnit(material.background_alpha);
	const height = readUnit(material.background_height);
	const width = readUnit(material.background_width);
	const radius = readUnit(material.background_round_radius);
	if (
		color === undefined ||
		opacity === undefined ||
		height === undefined ||
		width === undefined ||
		radius === undefined
	) {
		return undefined;
	}
	return {
		color: color.color,
		opacity: color.opacity * opacity,
		radiusPx: roundCanvasValue(radius * fontSizePx),
		paddingPx: roundCanvasValue(((height + width) / 2) * fontSizePx),
	};
}

function parseAlignment(value: unknown): InteropText["textAlign"] | undefined {
	if (value === 0) return "left";
	if (value === 1) return "center";
	if (value === 2) return "right";
	return undefined;
}

function parseFontFamily({
	material,
	style,
}: {
	material: Record<string, unknown>;
	style: Record<string, unknown>;
}): string {
	const font = isRecord(style.font) ? style.font : undefined;
	const candidates = [
		style.font,
		font?.family,
		font?.name,
		font?.title,
		material.font_name,
		material.font_title,
	];
	for (const candidate of candidates) {
		const family = readString(candidate)?.trim();
		if (
			family !== undefined &&
			family.length > 0 &&
			family.toLowerCase() !== "none"
		) {
			return family;
		}
	}
	return "Arial";
}

/**
 * Reads the bounded static single-style subset shared by verified profiles.
 * Profile policy controls only schema differences proven by real fixtures.
 */
export function mapStaticText({
	profileId,
	canvasWidth,
	canvasHeight,
	material,
	segment,
	graph,
}: MapStaticTextInput): MappedStaticText {
	const policy = resolveProfilePolicy({ profileId });
	if (policy === undefined || material.bucket !== "texts") {
		return blocked(
			"text material is outside the verified static-text profiles"
		);
	}
	if (material.raw.type !== "text") {
		return blocked("subtitle semantics are not mapped to a QCut text element");
	}
	if (
		!Number.isFinite(canvasWidth) ||
		canvasWidth <= 0 ||
		!Number.isFinite(canvasHeight) ||
		canvasHeight <= 0
	) {
		return blocked("text mapping requires a positive finite canvas");
	}
	if (!hasOnlyAllowedExtraRefs({ graph, policy, segment })) {
		return profileId === JIANYING_11_3_BETA4_PROFILE_ID
			? opaque("animated or decorated text is preserved but not editable")
			: blocked("animated or keyframed text is not mapped yet");
	}
	if (
		(Array.isArray(segment.raw.common_keyframes) &&
			segment.raw.common_keyframes.length > 0) ||
		(Array.isArray(segment.raw.keyframe_refs) &&
			segment.raw.keyframe_refs.length > 0)
	) {
		return blocked("animated or keyframed text is not mapped yet");
	}
	const serializedContent = readString(material.raw.content);
	if (
		serializedContent === undefined ||
		byteLength(serializedContent) > MAX_TEXT_CONTENT_BYTES
	) {
		return blocked(
			"text content is missing or exceeds the bounded parser limit"
		);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(serializedContent);
	} catch {
		return blocked("text content is not valid JSON");
	}
	if (!isRecord(payload) || typeof payload.text !== "string") {
		return blocked("text content JSON has no string text field");
	}
	if (
		!Array.isArray(payload.styles) ||
		payload.styles.length !== 1 ||
		!isRecord(payload.styles[0])
	) {
		return blocked("multi-run or missing text styles are not mapped yet");
	}
	const style = payload.styles[0];
	if (
		!Array.isArray(style.range) ||
		style.range.length !== 2 ||
		style.range[0] !== 0 ||
		style.range[1] !== payload.text.length
	) {
		return blocked("text style must cover the complete UTF-16 content range");
	}
	const materialFontSize = readFinite(material.raw.font_size);
	const styleFontSize = readFinite(style.size);
	const sourceFontSize = styleFontSize ?? materialFontSize;
	const globalAlpha = readUnit(material.raw.global_alpha);
	const clip = isRecord(segment.raw.clip) ? segment.raw.clip : undefined;
	const transform =
		clip && isRecord(clip.transform) ? clip.transform : undefined;
	const scale = clip && isRecord(clip.scale) ? clip.scale : undefined;
	const flip = clip && isRecord(clip.flip) ? clip.flip : undefined;
	const rotation = readFinite(clip?.rotation);
	const clipAlpha = readUnit(clip?.alpha);
	const transformX = readFinite(transform?.x);
	const transformY = readFinite(transform?.y);
	if (
		sourceFontSize === undefined ||
		sourceFontSize <= 0 ||
		globalAlpha === undefined ||
		rotation === undefined ||
		clipAlpha === undefined ||
		transformX === undefined ||
		transformY === undefined ||
		scale?.x !== 1 ||
		scale.y !== 1 ||
		flip?.horizontal !== false ||
		flip.vertical !== false
	) {
		return blocked("text geometry or opacity is outside the static subset");
	}
	const fontSizePx = roundCanvasValue(
		(sourceFontSize * canvasHeight) / TEXT_SIZE_REFERENCE_HEIGHT
	);
	const fill =
		parseSolidColor({ value: style.fill }) ??
		parseFallbackColor(material.raw.text_color);
	const alignment = parseAlignment(material.raw.alignment);
	const letterSpacing = readFinite(material.raw.letter_spacing);
	const lineMaxWidth = readUnit(material.raw.line_max_width);
	const stroke = parseStroke({
		allowMissingDecorationArrays: policy.allowMissingDecorationArrays,
		style,
		fontSizePx,
	});
	const shadow = parseShadow({
		allowMissingDecorationArrays: policy.allowMissingDecorationArrays,
		style,
		fontSizePx,
	});
	const background = parseBackground({ material: material.raw, fontSizePx });
	if (
		fill === undefined ||
		alignment === undefined ||
		letterSpacing === undefined ||
		lineMaxWidth === undefined ||
		stroke === undefined ||
		shadow === undefined ||
		background === undefined
	) {
		return blocked("text style contains unsupported or malformed values");
	}
	const text: InteropText = {
		content: payload.text,
		fontSizePx,
		fontFamily: parseFontFamily({ material: material.raw, style }),
		color: fill.color,
		textAlign: alignment,
		fontWeight: style.bold === true ? "bold" : "normal",
		fontStyle: style.italic === true ? "italic" : "normal",
		textDecoration: style.underline === true ? "underline" : "none",
		xPx: roundCanvasValue((transformX * canvasWidth) / 2),
		yPx: roundCanvasValue((-transformY * canvasHeight) / 2),
		rotationDegrees: rotation,
		opacity: globalAlpha * clipAlpha * fill.opacity,
		...(Math.abs(letterSpacing) <= Number.EPSILON
			? {}
			: { letterSpacingPx: roundCanvasValue(letterSpacing / 0.05) }),
		widthPx: roundCanvasValue(lineMaxWidth * canvasWidth),
		...(stroke === null ? {} : { stroke }),
		...(background === null ? {} : { background }),
		...(shadow === null ? {} : { shadow }),
		foreignRef: material.id,
	};
	return {
		capability: "downgrade",
		issueCode: "FEATURE_DOWNGRADED",
		reason: policy.reason,
		text,
	};
}

export const mapCapCut81StaticText = mapStaticText;
