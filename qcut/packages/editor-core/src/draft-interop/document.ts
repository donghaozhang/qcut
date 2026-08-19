/**
 * DraftInteropDocumentV1 — the bidirectional semantic layer between
 * JianYing/CapCut raw drafts and QCut (JYI-001).
 *
 * The document is pure, versioned, JSON-serializable data. It never embeds
 * editor-core timeline types (the editor must not carry raw-draft baggage)
 * and never embeds raw draft JSON (that lives in the ForeignDraftEnvelope,
 * JYI-002). All times are integer microseconds — JianYing's native unit —
 * so no float drift enters the contract.
 *
 * @module @qcut/editor-core/draft-interop/document
 */

import { type InteropCapability, isInteropCapability } from "./capability.js";
import {
	type InteropIssue,
	isInteropIssueCode,
	isInteropIssueSeverity,
} from "./issues.js";

export const DRAFT_INTEROP_SCHEMA_VERSION = 1 as const;
export const DRAFT_INTEROP_TIME_UNIT = "microseconds" as const;

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export type DraftSourceProduct = "jianying" | "capcut";
export type DraftSourcePlatform = "macos" | "windows" | "unknown";
export type DraftSourceFileRole =
	| "content"
	| "meta"
	| "asset"
	| "sidecar"
	| "unknown";
export type DraftSourceFileClassification =
	| "plaintext-json"
	| "opaque-text"
	| "binary"
	| "encrypted"
	| "unknown";

export interface DraftSourceFile {
	relativePath: string;
	byteLength: number;
	sha256: string;
	role: DraftSourceFileRole;
	classification: DraftSourceFileClassification;
}

export interface DraftSourceDescriptor {
	product: DraftSourceProduct;
	/** Registered profile id, e.g. "capcut-desktop-8.1-plaintext". */
	profileId: string;
	appVersion?: string;
	/** Source schema marker, e.g. "360000" / new_version. */
	schemaVersion?: string;
	platform: DraftSourcePlatform;
	/** Immutable snapshot manifest the whole document is bound to. */
	files: DraftSourceFile[];
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface InteropTimeRange {
	startUs: number;
	durationUs: number;
}

export interface InteropTextStroke {
	color: string;
	widthPx: number;
	opacity: number;
}

export interface InteropTextBackground {
	color: string;
	opacity: number;
	radiusPx: number;
	paddingPx: number;
}

export interface InteropTextShadow {
	color: string;
	opacity: number;
	offsetXPx: number;
	offsetYPx: number;
	blurPx: number;
}

export type InteropVisualKeyframeProperty = "x" | "y";

export interface InteropVisualKeyframe {
	id: string;
	/** Time relative to the owning segment, in document microseconds. */
	timeOffsetUs: number;
	value: number;
	easing: "linear";
	foreignRef?: string;
}

/**
 * Canvas-space visual state shared by foreign drafts and QCut. All values are
 * already in QCut conventions: pixels from canvas center, degrees clockwise
 * on screen, 1-based scale, 0..1 opacity — source-dialect conversions (e.g.
 * JianYing's half-canvas units and counterclockwise rotation) happen in the
 * profile mappers.
 */
export interface InteropMediaVisual {
	xPx: number;
	yPx: number;
	rotationDegrees?: number;
	scaleX?: number;
	scaleY?: number;
	opacity?: number;
	keyframes?: Partial<
		Record<InteropVisualKeyframeProperty, InteropVisualKeyframe[]>
	>;
}

/** Static text subset shared by foreign drafts and QCut. */
export interface InteropText {
	content: string;
	fontSizePx: number;
	fontFamily: string;
	color: string;
	textAlign: "left" | "center" | "right";
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline";
	xPx: number;
	yPx: number;
	rotationDegrees: number;
	opacity: number;
	letterSpacingPx?: number;
	widthPx?: number;
	stroke?: InteropTextStroke;
	background?: InteropTextBackground;
	shadow?: InteropTextShadow;
	foreignRef?: string;
}

export type InteropSegmentKind =
	| "video"
	| "image"
	| "audio"
	| "text"
	| "sticker"
	| "effect"
	| "filter"
	| "adjustment"
	| "transition"
	| "unknown";

/**
 * Declares how a downgrade segment is approximated in QCut (L0). Admission
 * into the import plan is declaration-gated: a downgrade segment without one
 * stays skipped, so every approximation is explicit and evidence-backed.
 */
export interface InteropDowngradeDeclaration {
	/** Machine-readable approximation kind, e.g. "filter-lut-recipe". */
	approximation: string;
	/** Pointer to the parity receipt backing the fidelity claim. */
	fidelityEvidence: string;
}

/**
 * A QCut fitted filter recipe a segment-attached foreign filter maps to (L6).
 * Values are in QCut vocabulary; the source resource id stays in the foreign
 * envelope. Intensity is the QCut 0-100 scale.
 */
export interface InteropFilterPreset {
	presetId: string;
	presetVersion: number;
	intensity: number;
}

/** Slider schema entry copied from a locally installed effect package (L7). */
export interface InteropEffectAdjustParameter {
	key: string;
	defaultValue: number;
	minimum: number;
	maximum: number;
}

/**
 * A locally installed jianying-local effect package an effect segment maps
 * to (L7). Machine-bound by design: admission requires the package on this
 * machine, and the mapped element renders through the local Jianying runtime.
 */
export interface InteropEffectPreset {
	presetId: string;
	name: string;
	/** Package md5 — the id the local catalog and the disk agree on. */
	packageHash: string;
	adjustParameters?: InteropEffectAdjustParameter[];
}

export interface InteropSegment {
	id: string;
	kind: InteropSegmentKind;
	/** Resource this segment plays, when it references one. */
	resourceId?: string;
	/** Range inside the source media, in source time. */
	sourceRange?: InteropTimeRange;
	/** Range occupied on the timeline. */
	targetRange: InteropTimeRange;
	speed?: number;
	text?: InteropText;
	visual?: InteropMediaVisual;
	/** Present when a fitted recipe backs a filter downgrade admission (L6). */
	filterPreset?: InteropFilterPreset;
	/** Present when a local package backs an effect downgrade admission (L7). */
	effectPreset?: InteropEffectPreset;
	capability: InteropCapability;
	/** Required for downgrade admission into the media import plan. */
	downgrade?: InteropDowngradeDeclaration;
	/** Binding key into the foreign envelope's raw-node map (JYI-002). */
	foreignRef?: string;
}

export type InteropTransitionType = "dissolve" | "unknown";

/**
 * A QCut transition preset a foreign transition maps to (L5). Values are in
 * QCut vocabulary; the source resource id stays in the foreign envelope.
 */
export interface InteropTransitionPreset {
	presetId: string;
	clipType: string;
	easing: string;
	direction?: string;
	intensity?: number;
}

/** A transition owned by the outgoing segment at one same-track seam. */
export interface InteropTransition {
	id: string;
	type: InteropTransitionType;
	fromSegmentId: string;
	toSegmentId: string;
	durationUs: number;
	capability: InteropCapability;
	/** Present when a lab preset mapping backs a downgrade admission. */
	preset?: InteropTransitionPreset;
	/** Required for downgrade admission into the import plan. */
	downgrade?: InteropDowngradeDeclaration;
	foreignRef?: string;
}

export type InteropTrackKind =
	| "video"
	| "audio"
	| "text"
	| "sticker"
	| "effect"
	| "adjustment"
	| "unknown";

export interface InteropTrack {
	id: string;
	kind: InteropTrackKind;
	/** Compositing order inside the timeline, 0-based, bottom first. */
	order: number;
	isMain?: boolean;
	segments: InteropSegment[];
	transitions?: InteropTransition[];
	capability: InteropCapability;
	foreignRef?: string;
}

export interface InteropTimeline {
	id: string;
	name?: string;
	/** The root timeline; child timelines back compound clips. */
	isRoot: boolean;
	fps?: number;
	tracks: InteropTrack[];
	foreignRef?: string;
}

// ---------------------------------------------------------------------------
// Resources and links
// ---------------------------------------------------------------------------

export type InteropResourceKind =
	| "video"
	| "image"
	| "audio"
	| "font"
	| "lut"
	| "filter"
	| "effect"
	| "transition-package"
	| "unknown";

export type InteropResourceStatus =
	| "resolved"
	| "pending"
	| "missing"
	| "opaque";

export interface InteropResource {
	id: string;
	kind: InteropResourceKind;
	name?: string;
	originHint?: "local-media" | "app-resource" | "package" | "unknown";
	sha256?: string;
	byteLength?: number;
	/** Intrinsic media duration in microseconds, when the source declares it. */
	durationUs?: number;
	status: InteropResourceStatus;
	capability: InteropCapability;
	foreignRef?: string;
}

/** Aligned with the timeline link vocabulary introduced by QTL-003. */
export type InteropLinkType =
	| "video-audio"
	| "group"
	| "caption-owner"
	| "effect-target"
	| "compound-child"
	| "semantic-scene";

export interface InteropLink {
	id: string;
	type: InteropLinkType;
	fromId: string;
	toId: string;
	/** User explicitly detached the link; automation must not re-follow. */
	detached?: boolean;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface InteropProject {
	id: string;
	name: string;
	width: number;
	height: number;
	fps: number;
	durationUs?: number;
}

export interface DraftInteropDocumentV1 {
	schemaVersion: typeof DRAFT_INTEROP_SCHEMA_VERSION;
	timeUnit: typeof DRAFT_INTEROP_TIME_UNIT;
	source: DraftSourceDescriptor;
	project: InteropProject;
	timelines: InteropTimeline[];
	resources: InteropResource[];
	links: InteropLink[];
	issues: InteropIssue[];
}

// ---------------------------------------------------------------------------
// Validating parser
// ---------------------------------------------------------------------------

export type ParseDraftInteropDocumentResult =
	| { ok: true; document: DraftInteropDocumentV1 }
	| { ok: false; issues: InteropIssue[] };

class MalformedDocumentError extends Error {
	readonly path: string;

	constructor({ message, path }: { message: string; path: string }) {
		super(message);
		this.name = "MalformedDocumentError";
		this.path = path;
	}
}

function fail({ message, path }: { message: string; path: string }): never {
	throw new MalformedDocumentError({ message, path });
}

function asRecord({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail({ message: "expected an object", path });
	}
	return value as Record<string, unknown>;
}

function asArray({ value, path }: { value: unknown; path: string }): unknown[] {
	if (!Array.isArray(value)) {
		fail({ message: "expected an array", path });
	}
	return value;
}

function asString({
	value,
	path,
	allowEmpty = false,
}: {
	value: unknown;
	path: string;
	allowEmpty?: boolean;
}): string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		fail({ message: "expected a non-empty string", path });
	}
	return value;
}

function asOptionalString({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): string | undefined {
	if (value === undefined) return undefined;
	return asString({ value, path });
}

function asNonNegativeSafeInteger({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail({ message: "expected a non-negative safe integer", path });
	}
	return value;
}

function asPositiveSafeInteger({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	const parsed = asNonNegativeSafeInteger({ value, path });
	if (parsed === 0) {
		fail({ message: "expected a positive safe integer", path });
	}
	return parsed;
}

function asPositiveFinite({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		fail({ message: "expected a positive finite number", path });
	}
	return value;
}

function asFiniteNumber({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		fail({ message: "expected a finite number", path });
	}
	return value;
}

function asUnitInterval({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	const parsed = asFiniteNumber({ value, path });
	if (parsed < 0 || parsed > 1) {
		fail({ message: "expected a number from 0 through 1", path });
	}
	return parsed;
}

function asNonNegativeFinite({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	const parsed = asFiniteNumber({ value, path });
	if (parsed < 0) {
		fail({ message: "expected a non-negative finite number", path });
	}
	return parsed;
}

function asColor({ value, path }: { value: unknown; path: string }): string {
	const color = asString({ value, path });
	if (!/^#[\da-f]{6}$/i.test(color)) {
		fail({ message: "expected a six-digit hexadecimal color", path });
	}
	return color.toLowerCase();
}

function asOptionalBoolean({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") {
		fail({ message: "expected a boolean", path });
	}
	return value;
}

function asEnum<T extends string>({
	value,
	path,
	allowed,
}: {
	value: unknown;
	path: string;
	allowed: readonly T[];
}): T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		fail({ message: `expected one of: ${allowed.join(", ")}`, path });
	}
	return value as T;
}

function asCapability({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropCapability {
	if (!isInteropCapability(value)) {
		fail({ message: "expected an interop capability", path });
	}
	return value;
}

function parseTimeRange({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTimeRange {
	const record = asRecord({ value, path });
	return {
		startUs: asNonNegativeSafeInteger({
			value: record.startUs,
			path: `${path}/startUs`,
		}),
		durationUs: asNonNegativeSafeInteger({
			value: record.durationUs,
			path: `${path}/durationUs`,
		}),
	};
}

function parseSourceFile({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): DraftSourceFile {
	const record = asRecord({ value, path });
	return {
		relativePath: asString({
			value: record.relativePath,
			path: `${path}/relativePath`,
		}),
		byteLength: asNonNegativeSafeInteger({
			value: record.byteLength,
			path: `${path}/byteLength`,
		}),
		sha256: asString({ value: record.sha256, path: `${path}/sha256` }),
		role: asEnum({
			value: record.role,
			path: `${path}/role`,
			allowed: ["content", "meta", "asset", "sidecar", "unknown"],
		}),
		classification: asEnum({
			value: record.classification,
			path: `${path}/classification`,
			allowed: [
				"plaintext-json",
				"opaque-text",
				"binary",
				"encrypted",
				"unknown",
			],
		}),
	};
}

function parseSource({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): DraftSourceDescriptor {
	const record = asRecord({ value, path });
	const appVersion = asOptionalString({
		value: record.appVersion,
		path: `${path}/appVersion`,
	});
	const schemaVersion = asOptionalString({
		value: record.schemaVersion,
		path: `${path}/schemaVersion`,
	});
	return {
		product: asEnum({
			value: record.product,
			path: `${path}/product`,
			allowed: ["jianying", "capcut"],
		}),
		profileId: asString({
			value: record.profileId,
			path: `${path}/profileId`,
		}),
		...(appVersion === undefined ? {} : { appVersion }),
		...(schemaVersion === undefined ? {} : { schemaVersion }),
		platform: asEnum({
			value: record.platform,
			path: `${path}/platform`,
			allowed: ["macos", "windows", "unknown"],
		}),
		files: asArray({ value: record.files, path: `${path}/files` }).map(
			(file, index) =>
				parseSourceFile({ value: file, path: `${path}/files/${index}` })
		),
	};
}

function parseSegment({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropSegment {
	const record = asRecord({ value, path });
	const resourceId = asOptionalString({
		value: record.resourceId,
		path: `${path}/resourceId`,
	});
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	const sourceRange =
		record.sourceRange === undefined
			? undefined
			: parseTimeRange({
					value: record.sourceRange,
					path: `${path}/sourceRange`,
				});
	const speed =
		record.speed === undefined
			? undefined
			: asPositiveFinite({ value: record.speed, path: `${path}/speed` });
	const text =
		record.text === undefined
			? undefined
			: parseText({ value: record.text, path: `${path}/text` });
	const visual =
		record.visual === undefined
			? undefined
			: parseMediaVisual({ value: record.visual, path: `${path}/visual` });
	const downgrade =
		record.downgrade === undefined
			? undefined
			: parseDowngradeDeclaration({
					value: record.downgrade,
					path: `${path}/downgrade`,
				});
	const filterPreset =
		record.filterPreset === undefined
			? undefined
			: parseFilterPreset({
					value: record.filterPreset,
					path: `${path}/filterPreset`,
				});
	const effectPreset =
		record.effectPreset === undefined
			? undefined
			: parseEffectPreset({
					value: record.effectPreset,
					path: `${path}/effectPreset`,
				});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		kind: asEnum({
			value: record.kind,
			path: `${path}/kind`,
			allowed: [
				"video",
				"image",
				"audio",
				"text",
				"sticker",
				"effect",
				"filter",
				"adjustment",
				"transition",
				"unknown",
			],
		}),
		...(resourceId === undefined ? {} : { resourceId }),
		...(sourceRange === undefined ? {} : { sourceRange }),
		targetRange: parseTimeRange({
			value: record.targetRange,
			path: `${path}/targetRange`,
		}),
		...(speed === undefined ? {} : { speed }),
		...(text === undefined ? {} : { text }),
		...(visual === undefined ? {} : { visual }),
		...(filterPreset === undefined ? {} : { filterPreset }),
		...(effectPreset === undefined ? {} : { effectPreset }),
		capability: asCapability({
			value: record.capability,
			path: `${path}/capability`,
		}),
		...(downgrade === undefined ? {} : { downgrade }),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseEffectPreset({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropEffectPreset {
	const record = asRecord({ value, path });
	const adjustParameters =
		record.adjustParameters === undefined
			? undefined
			: asArray({
					value: record.adjustParameters,
					path: `${path}/adjustParameters`,
				}).map((entry, index) => {
					const parameterPath = `${path}/adjustParameters/${index}`;
					const parameter = asRecord({ value: entry, path: parameterPath });
					return {
						key: asString({
							value: parameter.key,
							path: `${parameterPath}/key`,
						}),
						defaultValue: asFiniteNumber({
							value: parameter.defaultValue,
							path: `${parameterPath}/defaultValue`,
						}),
						minimum: asFiniteNumber({
							value: parameter.minimum,
							path: `${parameterPath}/minimum`,
						}),
						maximum: asFiniteNumber({
							value: parameter.maximum,
							path: `${parameterPath}/maximum`,
						}),
					};
				});
	return {
		presetId: asString({ value: record.presetId, path: `${path}/presetId` }),
		name: asString({ value: record.name, path: `${path}/name` }),
		packageHash: asString({
			value: record.packageHash,
			path: `${path}/packageHash`,
		}),
		...(adjustParameters === undefined ? {} : { adjustParameters }),
	};
}

function parseFilterPreset({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropFilterPreset {
	const record = asRecord({ value, path });
	return {
		presetId: asString({ value: record.presetId, path: `${path}/presetId` }),
		presetVersion: asPositiveFinite({
			value: record.presetVersion,
			path: `${path}/presetVersion`,
		}),
		intensity: asFiniteNumber({
			value: record.intensity,
			path: `${path}/intensity`,
		}),
	};
}

function parseDowngradeDeclaration({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropDowngradeDeclaration {
	const record = asRecord({ value, path });
	return {
		approximation: asString({
			value: record.approximation,
			path: `${path}/approximation`,
		}),
		fidelityEvidence: asString({
			value: record.fidelityEvidence,
			path: `${path}/fidelityEvidence`,
		}),
	};
}

function parseVisualKeyframe({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropVisualKeyframe {
	const record = asRecord({ value, path });
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		timeOffsetUs: asNonNegativeSafeInteger({
			value: record.timeOffsetUs,
			path: `${path}/timeOffsetUs`,
		}),
		value: asFiniteNumber({ value: record.value, path: `${path}/value` }),
		easing: asEnum({
			value: record.easing,
			path: `${path}/easing`,
			allowed: ["linear"],
		}),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseMediaVisual({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropMediaVisual {
	const record = asRecord({ value, path });
	const keyframesRecord =
		record.keyframes === undefined
			? undefined
			: asRecord({ value: record.keyframes, path: `${path}/keyframes` });
	if (keyframesRecord !== undefined) {
		// Unknown channels (scale, rotation, …) must fail closed rather than
		// silently drop: semantic diffing only compares x/y and would never
		// detect the loss. Mirrors parsePlanMediaKeyframes.
		for (const key of Object.keys(keyframesRecord)) {
			if (key !== "x" && key !== "y") {
				fail({
					message: "unsupported media keyframe property",
					path: `${path}/keyframes`,
				});
			}
		}
	}
	const parseProperty = ({ property }: { property: "x" | "y" }) => {
		const entries = keyframesRecord?.[property];
		return entries === undefined
			? undefined
			: asArray({
					value: entries,
					path: `${path}/keyframes/${property}`,
				}).map((entry, index) =>
					parseVisualKeyframe({
						value: entry,
						path: `${path}/keyframes/${property}/${index}`,
					})
				);
	};
	const x = parseProperty({ property: "x" });
	const y = parseProperty({ property: "y" });
	const rotationDegrees =
		record.rotationDegrees === undefined
			? undefined
			: asFiniteNumber({
					value: record.rotationDegrees,
					path: `${path}/rotationDegrees`,
				});
	const scaleX =
		record.scaleX === undefined
			? undefined
			: asPositiveFinite({ value: record.scaleX, path: `${path}/scaleX` });
	const scaleY =
		record.scaleY === undefined
			? undefined
			: asPositiveFinite({ value: record.scaleY, path: `${path}/scaleY` });
	const opacity =
		record.opacity === undefined
			? undefined
			: asUnitInterval({ value: record.opacity, path: `${path}/opacity` });
	return {
		xPx: asFiniteNumber({ value: record.xPx, path: `${path}/xPx` }),
		yPx: asFiniteNumber({ value: record.yPx, path: `${path}/yPx` }),
		...(rotationDegrees === undefined ? {} : { rotationDegrees }),
		...(scaleX === undefined ? {} : { scaleX }),
		...(scaleY === undefined ? {} : { scaleY }),
		...(opacity === undefined ? {} : { opacity }),
		...(keyframesRecord === undefined
			? {}
			: {
					keyframes: {
						...(x === undefined ? {} : { x }),
						...(y === undefined ? {} : { y }),
					},
				}),
	};
}

function parseTextStroke({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTextStroke {
	const record = asRecord({ value, path });
	return {
		color: asColor({ value: record.color, path: `${path}/color` }),
		widthPx: asNonNegativeFinite({
			value: record.widthPx,
			path: `${path}/widthPx`,
		}),
		opacity: asUnitInterval({
			value: record.opacity,
			path: `${path}/opacity`,
		}),
	};
}

function parseTextBackground({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTextBackground {
	const record = asRecord({ value, path });
	return {
		color: asColor({ value: record.color, path: `${path}/color` }),
		opacity: asUnitInterval({
			value: record.opacity,
			path: `${path}/opacity`,
		}),
		radiusPx: asNonNegativeFinite({
			value: record.radiusPx,
			path: `${path}/radiusPx`,
		}),
		paddingPx: asNonNegativeFinite({
			value: record.paddingPx,
			path: `${path}/paddingPx`,
		}),
	};
}

function parseTextShadow({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTextShadow {
	const record = asRecord({ value, path });
	return {
		color: asColor({ value: record.color, path: `${path}/color` }),
		opacity: asUnitInterval({
			value: record.opacity,
			path: `${path}/opacity`,
		}),
		offsetXPx: asFiniteNumber({
			value: record.offsetXPx,
			path: `${path}/offsetXPx`,
		}),
		offsetYPx: asFiniteNumber({
			value: record.offsetYPx,
			path: `${path}/offsetYPx`,
		}),
		blurPx: asNonNegativeFinite({
			value: record.blurPx,
			path: `${path}/blurPx`,
		}),
	};
}

function parseText({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropText {
	const record = asRecord({ value, path });
	const letterSpacingPx =
		record.letterSpacingPx === undefined
			? undefined
			: asFiniteNumber({
					value: record.letterSpacingPx,
					path: `${path}/letterSpacingPx`,
				});
	const widthPx =
		record.widthPx === undefined
			? undefined
			: asNonNegativeFinite({
					value: record.widthPx,
					path: `${path}/widthPx`,
				});
	const stroke =
		record.stroke === undefined
			? undefined
			: parseTextStroke({ value: record.stroke, path: `${path}/stroke` });
	const background =
		record.background === undefined
			? undefined
			: parseTextBackground({
					value: record.background,
					path: `${path}/background`,
				});
	const shadow =
		record.shadow === undefined
			? undefined
			: parseTextShadow({ value: record.shadow, path: `${path}/shadow` });
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	return {
		content: asString({
			value: record.content,
			path: `${path}/content`,
			allowEmpty: true,
		}),
		fontSizePx: asPositiveFinite({
			value: record.fontSizePx,
			path: `${path}/fontSizePx`,
		}),
		fontFamily: asString({
			value: record.fontFamily,
			path: `${path}/fontFamily`,
		}),
		color: asColor({ value: record.color, path: `${path}/color` }),
		textAlign: asEnum({
			value: record.textAlign,
			path: `${path}/textAlign`,
			allowed: ["left", "center", "right"],
		}),
		fontWeight: asEnum({
			value: record.fontWeight,
			path: `${path}/fontWeight`,
			allowed: ["normal", "bold"],
		}),
		fontStyle: asEnum({
			value: record.fontStyle,
			path: `${path}/fontStyle`,
			allowed: ["normal", "italic"],
		}),
		textDecoration: asEnum({
			value: record.textDecoration,
			path: `${path}/textDecoration`,
			allowed: ["none", "underline"],
		}),
		xPx: asFiniteNumber({ value: record.xPx, path: `${path}/xPx` }),
		yPx: asFiniteNumber({ value: record.yPx, path: `${path}/yPx` }),
		rotationDegrees: asFiniteNumber({
			value: record.rotationDegrees,
			path: `${path}/rotationDegrees`,
		}),
		opacity: asUnitInterval({
			value: record.opacity,
			path: `${path}/opacity`,
		}),
		...(letterSpacingPx === undefined ? {} : { letterSpacingPx }),
		...(widthPx === undefined ? {} : { widthPx }),
		...(stroke === undefined ? {} : { stroke }),
		...(background === undefined ? {} : { background }),
		...(shadow === undefined ? {} : { shadow }),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseTransitionPreset({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTransitionPreset {
	const record = asRecord({ value, path });
	const direction = asOptionalString({
		value: record.direction,
		path: `${path}/direction`,
	});
	const intensity =
		record.intensity === undefined
			? undefined
			: asUnitInterval({
					value: record.intensity,
					path: `${path}/intensity`,
				});
	return {
		presetId: asString({ value: record.presetId, path: `${path}/presetId` }),
		clipType: asString({ value: record.clipType, path: `${path}/clipType` }),
		easing: asString({ value: record.easing, path: `${path}/easing` }),
		...(direction === undefined ? {} : { direction }),
		...(intensity === undefined ? {} : { intensity }),
	};
}

function parseTransition({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTransition {
	const record = asRecord({ value, path });
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	const preset =
		record.preset === undefined
			? undefined
			: parseTransitionPreset({ value: record.preset, path: `${path}/preset` });
	const downgrade =
		record.downgrade === undefined
			? undefined
			: parseDowngradeDeclaration({
					value: record.downgrade,
					path: `${path}/downgrade`,
				});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		type: asEnum({
			value: record.type,
			path: `${path}/type`,
			allowed: ["dissolve", "unknown"],
		}),
		fromSegmentId: asString({
			value: record.fromSegmentId,
			path: `${path}/fromSegmentId`,
		}),
		toSegmentId: asString({
			value: record.toSegmentId,
			path: `${path}/toSegmentId`,
		}),
		durationUs: asPositiveSafeInteger({
			value: record.durationUs,
			path: `${path}/durationUs`,
		}),
		capability: asCapability({
			value: record.capability,
			path: `${path}/capability`,
		}),
		...(preset === undefined ? {} : { preset }),
		...(downgrade === undefined ? {} : { downgrade }),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseTrack({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTrack {
	const record = asRecord({ value, path });
	const isMain = asOptionalBoolean({
		value: record.isMain,
		path: `${path}/isMain`,
	});
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	const transitions =
		record.transitions === undefined
			? undefined
			: asArray({
					value: record.transitions,
					path: `${path}/transitions`,
				}).map((transition, index) =>
					parseTransition({
						value: transition,
						path: `${path}/transitions/${index}`,
					})
				);
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		kind: asEnum({
			value: record.kind,
			path: `${path}/kind`,
			allowed: [
				"video",
				"audio",
				"text",
				"sticker",
				"effect",
				"adjustment",
				"unknown",
			],
		}),
		order: asNonNegativeSafeInteger({
			value: record.order,
			path: `${path}/order`,
		}),
		...(isMain === undefined ? {} : { isMain }),
		segments: asArray({
			value: record.segments,
			path: `${path}/segments`,
		}).map((segment, index) =>
			parseSegment({ value: segment, path: `${path}/segments/${index}` })
		),
		...(transitions === undefined ? {} : { transitions }),
		capability: asCapability({
			value: record.capability,
			path: `${path}/capability`,
		}),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseTimeline({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropTimeline {
	const record = asRecord({ value, path });
	const name = asOptionalString({ value: record.name, path: `${path}/name` });
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	const fps =
		record.fps === undefined
			? undefined
			: asPositiveFinite({ value: record.fps, path: `${path}/fps` });
	if (typeof record.isRoot !== "boolean") {
		fail({ message: "expected a boolean", path: `${path}/isRoot` });
	}
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		...(name === undefined ? {} : { name }),
		isRoot: record.isRoot,
		...(fps === undefined ? {} : { fps }),
		tracks: asArray({ value: record.tracks, path: `${path}/tracks` }).map(
			(track, index) =>
				parseTrack({ value: track, path: `${path}/tracks/${index}` })
		),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseResource({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropResource {
	const record = asRecord({ value, path });
	const name = asOptionalString({ value: record.name, path: `${path}/name` });
	const sha256 = asOptionalString({
		value: record.sha256,
		path: `${path}/sha256`,
	});
	const foreignRef = asOptionalString({
		value: record.foreignRef,
		path: `${path}/foreignRef`,
	});
	const originHint =
		record.originHint === undefined
			? undefined
			: asEnum({
					value: record.originHint,
					path: `${path}/originHint`,
					allowed: ["local-media", "app-resource", "package", "unknown"],
				});
	const byteLength =
		record.byteLength === undefined
			? undefined
			: asNonNegativeSafeInteger({
					value: record.byteLength,
					path: `${path}/byteLength`,
				});
	const durationUs =
		record.durationUs === undefined
			? undefined
			: asNonNegativeSafeInteger({
					value: record.durationUs,
					path: `${path}/durationUs`,
				});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		kind: asEnum({
			value: record.kind,
			path: `${path}/kind`,
			allowed: [
				"video",
				"image",
				"audio",
				"font",
				"lut",
				"filter",
				"effect",
				"transition-package",
				"unknown",
			],
		}),
		...(name === undefined ? {} : { name }),
		...(originHint === undefined ? {} : { originHint }),
		...(sha256 === undefined ? {} : { sha256 }),
		...(byteLength === undefined ? {} : { byteLength }),
		...(durationUs === undefined ? {} : { durationUs }),
		status: asEnum({
			value: record.status,
			path: `${path}/status`,
			allowed: ["resolved", "pending", "missing", "opaque"],
		}),
		capability: asCapability({
			value: record.capability,
			path: `${path}/capability`,
		}),
		...(foreignRef === undefined ? {} : { foreignRef }),
	};
}

function parseLink({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropLink {
	const record = asRecord({ value, path });
	const detached = asOptionalBoolean({
		value: record.detached,
		path: `${path}/detached`,
	});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		type: asEnum({
			value: record.type,
			path: `${path}/type`,
			allowed: [
				"video-audio",
				"group",
				"caption-owner",
				"effect-target",
				"compound-child",
				"semantic-scene",
			],
		}),
		fromId: asString({ value: record.fromId, path: `${path}/fromId` }),
		toId: asString({ value: record.toId, path: `${path}/toId` }),
		...(detached === undefined ? {} : { detached }),
	};
}

function parseIssue({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropIssue {
	const record = asRecord({ value, path });
	if (!isInteropIssueCode(record.code)) {
		fail({ message: "unknown interop issue code", path: `${path}/code` });
	}
	if (!isInteropIssueSeverity(record.severity)) {
		fail({ message: "unknown issue severity", path: `${path}/severity` });
	}
	const issuePath = asOptionalString({
		value: record.path,
		path: `${path}/path`,
	});
	const subjectId = asOptionalString({
		value: record.subjectId,
		path: `${path}/subjectId`,
	});
	return {
		code: record.code,
		severity: record.severity,
		message: asString({
			value: record.message,
			path: `${path}/message`,
			allowEmpty: true,
		}),
		...(issuePath === undefined ? {} : { path: issuePath }),
		...(subjectId === undefined ? {} : { subjectId }),
	};
}

function parseProject({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): InteropProject {
	const record = asRecord({ value, path });
	const durationUs =
		record.durationUs === undefined
			? undefined
			: asNonNegativeSafeInteger({
					value: record.durationUs,
					path: `${path}/durationUs`,
				});
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		name: asString({
			value: record.name,
			path: `${path}/name`,
			allowEmpty: true,
		}),
		width: asPositiveFinite({ value: record.width, path: `${path}/width` }),
		height: asPositiveFinite({ value: record.height, path: `${path}/height` }),
		fps: asPositiveFinite({ value: record.fps, path: `${path}/fps` }),
		...(durationUs === undefined ? {} : { durationUs }),
	};
}

/**
 * Structural, fail-closed validation of an untrusted document value.
 * Graph-level checks (broken refs, cycles, overlaps) belong to the import
 * validation stage — this parser guarantees shape, not semantics.
 */
export function parseDraftInteropDocumentV1(
	value: unknown
): ParseDraftInteropDocumentResult {
	try {
		const record = asRecord({ value, path: "" });
		if (record.schemaVersion !== DRAFT_INTEROP_SCHEMA_VERSION) {
			fail({
				message: "unsupported interop schema version",
				path: "/schemaVersion",
			});
		}
		if (record.timeUnit !== DRAFT_INTEROP_TIME_UNIT) {
			fail({ message: "unsupported time unit", path: "/timeUnit" });
		}
		const document: DraftInteropDocumentV1 = {
			schemaVersion: DRAFT_INTEROP_SCHEMA_VERSION,
			timeUnit: DRAFT_INTEROP_TIME_UNIT,
			source: parseSource({ value: record.source, path: "/source" }),
			project: parseProject({ value: record.project, path: "/project" }),
			timelines: asArray({
				value: record.timelines,
				path: "/timelines",
			}).map((timeline, index) =>
				parseTimeline({ value: timeline, path: `/timelines/${index}` })
			),
			resources: asArray({
				value: record.resources,
				path: "/resources",
			}).map((resource, index) =>
				parseResource({ value: resource, path: `/resources/${index}` })
			),
			links: asArray({ value: record.links, path: "/links" }).map(
				(link, index) => parseLink({ value: link, path: `/links/${index}` })
			),
			issues: asArray({ value: record.issues, path: "/issues" }).map(
				(issue, index) => parseIssue({ value: issue, path: `/issues/${index}` })
			),
		};
		return { ok: true, document };
	} catch (error) {
		if (error instanceof MalformedDocumentError) {
			return {
				ok: false,
				issues: [
					{
						code: "DOCUMENT_MALFORMED",
						severity: "error",
						message: error.message,
						path: error.path,
					},
				],
			};
		}
		throw error;
	}
}
