import type {
	InteropText,
	InteropTextBackground,
	InteropTextShadow,
	InteropTextStroke,
} from "./document.js";

export interface SemanticTextDiffEntry {
	path: string;
	kind: "missing" | "extra" | "changed";
	subjectId: string;
	left?: unknown;
	right?: unknown;
}

const TEXT_SCALAR_FIELDS = [
	"content",
	"fontSizePx",
	"fontFamily",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"xPx",
	"yPx",
	"rotationDegrees",
	"opacity",
	"letterSpacingPx",
	"widthPx",
] as const satisfies readonly (keyof InteropText)[];

const TEXT_STROKE_FIELDS = [
	"color",
	"widthPx",
	"opacity",
] as const satisfies readonly (keyof InteropTextStroke)[];

const TEXT_BACKGROUND_FIELDS = [
	"color",
	"opacity",
	"radiusPx",
	"paddingPx",
] as const satisfies readonly (keyof InteropTextBackground)[];

const TEXT_SHADOW_FIELDS = [
	"color",
	"opacity",
	"offsetXPx",
	"offsetYPx",
	"blurPx",
] as const satisfies readonly (keyof InteropTextShadow)[];

function diffScalarFields<Node extends object>({
	path,
	subjectId,
	fields,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	fields: readonly (keyof Node)[];
	left: Node;
	right: Node;
}): SemanticTextDiffEntry[] {
	const entries: SemanticTextDiffEntry[] = [];
	for (const field of fields) {
		if (left[field] !== right[field]) {
			entries.push({
				path: `${path}/${String(field)}`,
				kind: "changed",
				subjectId,
				left: left[field],
				right: right[field],
			});
		}
	}
	return entries;
}

function diffOptionalNode<Node extends object>({
	path,
	subjectId,
	fields,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	fields: readonly (keyof Node)[];
	left?: Node;
	right?: Node;
}): SemanticTextDiffEntry[] {
	if (left === undefined && right === undefined) return [];
	if (left === undefined || right === undefined) {
		return [
			{
				path,
				kind: left === undefined ? "extra" : "missing",
				subjectId,
			},
		];
	}
	return diffScalarFields({ path, subjectId, fields, left, right });
}

/** Compares static text semantics while intentionally excluding foreignRef. */
export function diffInteropTextSemantics({
	path,
	subjectId,
	left,
	right,
}: {
	path: string;
	subjectId: string;
	left?: InteropText;
	right?: InteropText;
}): SemanticTextDiffEntry[] {
	if (left === undefined && right === undefined) return [];
	if (left === undefined || right === undefined) {
		return [
			{
				path,
				kind: left === undefined ? "extra" : "missing",
				subjectId,
			},
		];
	}
	return [
		...diffScalarFields({
			path,
			subjectId,
			fields: TEXT_SCALAR_FIELDS,
			left,
			right,
		}),
		...diffOptionalNode({
			path: `${path}/stroke`,
			subjectId,
			fields: TEXT_STROKE_FIELDS,
			left: left.stroke,
			right: right.stroke,
		}),
		...diffOptionalNode({
			path: `${path}/background`,
			subjectId,
			fields: TEXT_BACKGROUND_FIELDS,
			left: left.background,
			right: right.background,
		}),
		...diffOptionalNode({
			path: `${path}/shadow`,
			subjectId,
			fields: TEXT_SHADOW_FIELDS,
			left: left.shadow,
			right: right.shadow,
		}),
	];
}
