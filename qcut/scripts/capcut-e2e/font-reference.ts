import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import { requireCanonicalPath } from "./gui-regression-filesystem.js";

const MAXIMUM_FONT_REFERENCE_DRAFT_BYTES = 256 * 1024 * 1024;
const FONT_REFERENCE_SCHEMA = "qcut.capcut-8-1.font-reference" as const;
const FONT_REFERENCE_SCHEMA_VERSION = 1 as const;

interface FieldSnapshot {
	present: boolean;
	value: unknown;
}

export interface CapCut81FontBindingSnapshot {
	materialFields: Readonly<Record<string, unknown>>;
	materialFonts: FieldSnapshot;
	styleFonts: readonly (FieldSnapshot & { styleIndex: number })[];
	text: string;
	topLevelFontMaterials: FieldSnapshot;
}

export interface CapCut81FontReferenceDraftEvidence {
	binding: CapCut81FontBindingSnapshot;
	canonicalDraftDirectory: string;
	nonFontTargetSha256: string;
	rootDraftInfo: {
		bytes: number;
		path: string;
		sha256: string;
	};
	targetMaterialId: string;
	timelineDraftInfo: {
		bytes: number;
		path: string;
		sha256: string;
	};
	timelineId: string;
}

export interface CapCut81FontReferencePair {
	after: CapCut81FontReferenceDraftEvidence;
	before: CapCut81FontReferenceDraftEvidence;
	changedPaths: readonly string[];
	fontLabel: string;
	schema: typeof FONT_REFERENCE_SCHEMA;
	schemaVersion: typeof FONT_REFERENCE_SCHEMA_VERSION;
	targetText: string;
}

interface ParsedTextTarget {
	binding: CapCut81FontBindingSnapshot;
	materialId: string;
	nonFontTarget: unknown;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function parseJsonRecord({
	label,
	text,
}: {
	label: string;
	text: string;
}): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`${label} must contain valid JSON.`);
	}
	return requireRecord({ label, value: parsed });
}

function snapshotField({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}): FieldSnapshot {
	return {
		present: Object.hasOwn(record, key),
		value: Object.hasOwn(record, key) ? record[key] : null,
	};
}

function isMaterialFontField({ key }: { key: string }): boolean {
	return key === "fonts" || key.startsWith("font_");
}

function sortedRecord({
	entries,
}: {
	entries: readonly (readonly [string, unknown])[];
}): Record<string, unknown> {
	return Object.fromEntries(
		[...entries].sort(([left], [right]) => left.localeCompare(right))
	);
}

function stripStyleFont({
	style,
}: {
	style: Record<string, unknown>;
}): Record<string, unknown> {
	return sortedRecord({
		entries: Object.entries(style).filter(([key]) => key !== "font"),
	});
}

function extractTextTarget({
	draftInfoText,
	label,
	targetText,
}: {
	draftInfoText: string;
	label: string;
	targetText: string;
}): ParsedTextTarget {
	const root = parseJsonRecord({ label, text: draftInfoText });
	const materials = requireRecord({
		label: `${label} materials`,
		value: root.materials,
	});
	const texts = requireArray({
		label: `${label} text materials`,
		value: materials.texts,
	});
	const matches = texts.flatMap((value, index) => {
		const material = requireRecord({
			label: `${label} text material ${index}`,
			value,
		});
		const payload = parseJsonRecord({
			label: `${label} text material ${index} content`,
			text: requireString({
				label: `${label} text material ${index} content`,
				value: material.content,
			}),
		});
		return payload.text === targetText ? [{ material, payload }] : [];
	});
	if (matches.length !== 1) {
		throw new Error(
			`${label} must contain exactly one text material with ${JSON.stringify(targetText)}; found ${matches.length}.`
		);
	}
	const match = matches[0];
	if (!match) throw new Error(`${label} target material is unavailable.`);
	const styles = requireArray({
		label: `${label} target styles`,
		value: match.payload.styles,
	}).map((value, styleIndex) => ({
		style: requireRecord({
			label: `${label} target style ${styleIndex}`,
			value,
		}),
		styleIndex,
	}));
	if (styles.length === 0) {
		throw new Error(`${label} target must contain at least one text style.`);
	}
	const materialFields = sortedRecord({
		entries: Object.entries(match.material).filter(([key]) =>
			key.startsWith("font_")
		),
	});
	const nonFontPayload = sortedRecord({
		entries: Object.entries(match.payload).map(([key, value]) => [
			key,
			key === "styles"
				? styles.map(({ style }) => stripStyleFont({ style }))
				: value,
		]),
	});
	const nonFontTarget = sortedRecord({
		entries: Object.entries(match.material)
			.filter(([key]) => !isMaterialFontField({ key }))
			.map(([key, value]) => [key, key === "content" ? nonFontPayload : value]),
	});
	return {
		binding: {
			materialFields,
			materialFonts: snapshotField({ key: "fonts", record: match.material }),
			styleFonts: styles.map(({ style, styleIndex }) => ({
				...snapshotField({ key: "font", record: style }),
				styleIndex,
			})),
			text: targetText,
			topLevelFontMaterials: snapshotField({ key: "fonts", record: materials }),
		},
		materialId: requireString({
			label: `${label} target material id`,
			value: match.material.id,
		}),
		nonFontTarget,
	};
}

function sha256Bytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function sha256Value({ value }: { value: unknown }): string {
	return createHash("sha256")
		.update(JSON.stringify(value), "utf8")
		.digest("hex");
}

async function readDraftInfo({ label, path }: { label: string; path: string }) {
	const snapshot = await readRegularFileSnapshot({
		label,
		maximumBytes: MAXIMUM_FONT_REFERENCE_DRAFT_BYTES,
		path,
	});
	return {
		bytes: snapshot.bytes,
		evidence: {
			bytes: snapshot.bytes.length,
			path,
			sha256: sha256Bytes({ bytes: snapshot.bytes }),
		},
	};
}

export async function inspectCapCut81FontReferenceDraft({
	draftDirectory,
	targetText,
}: {
	draftDirectory: string;
	targetText: string;
}): Promise<CapCut81FontReferenceDraftEvidence> {
	const draft = await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut font reference draft",
		path: draftDirectory,
	});
	const timelinesDirectory = await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut font reference Timelines directory",
		path: join(draft.canonicalPath, "Timelines"),
	});
	const timelineEntries = await readdir(timelinesDirectory.canonicalPath, {
		withFileTypes: true,
	});
	const timelineIds = timelineEntries
		.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
		.map(({ name }) => name)
		.sort();
	if (timelineEntries.some((entry) => entry.isSymbolicLink())) {
		throw new Error(
			"CapCut font reference Timelines must not contain symlinks."
		);
	}
	if (timelineIds.length !== 1) {
		throw new Error(
			`CapCut font reference must contain exactly one timeline; found ${timelineIds.length}.`
		);
	}
	const timelineId = timelineIds[0];
	if (!timelineId)
		throw new Error("CapCut font reference timeline is missing.");
	const [rootDraftInfo, timelineDraftInfo] = await Promise.all([
		readDraftInfo({
			label: "CapCut font reference root draft_info.json",
			path: join(draft.canonicalPath, "draft_info.json"),
		}),
		readDraftInfo({
			label: "CapCut font reference timeline draft_info.json",
			path: join(
				timelinesDirectory.canonicalPath,
				timelineId,
				"draft_info.json"
			),
		}),
	]);
	const rootTarget = extractTextTarget({
		draftInfoText: rootDraftInfo.bytes.toString("utf8"),
		label: "Root draft_info.json",
		targetText,
	});
	const timelineTarget = extractTextTarget({
		draftInfoText: timelineDraftInfo.bytes.toString("utf8"),
		label: "Timeline draft_info.json",
		targetText,
	});
	if (!isDeepStrictEqual(rootTarget, timelineTarget)) {
		throw new Error(
			"Root and timeline draft_info.json disagree on the target text material."
		);
	}
	return {
		binding: rootTarget.binding,
		canonicalDraftDirectory: draft.canonicalPath,
		nonFontTargetSha256: sha256Value({ value: rootTarget.nonFontTarget }),
		rootDraftInfo: rootDraftInfo.evidence,
		targetMaterialId: rootTarget.materialId,
		timelineDraftInfo: timelineDraftInfo.evidence,
		timelineId,
	};
}

function collectChangedPaths({
	after,
	before,
}: {
	after: CapCut81FontBindingSnapshot;
	before: CapCut81FontBindingSnapshot;
}): string[] {
	const materialKeys = new Set([
		...Object.keys(before.materialFields),
		...Object.keys(after.materialFields),
	]);
	const changedMaterialPaths = [...materialKeys]
		.sort()
		.filter(
			(key) =>
				!isDeepStrictEqual(
					before.materialFields[key],
					after.materialFields[key]
				)
		)
		.map((key) => `material.${key}`);
	const styleCount = Math.max(
		before.styleFonts.length,
		after.styleFonts.length
	);
	const changedStylePaths = Array.from(
		{ length: styleCount },
		(_, styleIndex) =>
			isDeepStrictEqual(
				before.styleFonts[styleIndex],
				after.styleFonts[styleIndex]
			)
				? null
				: `content.styles[${styleIndex}].font`
	).filter((path): path is string => path !== null);
	return [
		...changedMaterialPaths,
		...(isDeepStrictEqual(before.materialFonts, after.materialFonts)
			? []
			: ["material.fonts"]),
		...(isDeepStrictEqual(
			before.topLevelFontMaterials,
			after.topLevelFontMaterials
		)
			? []
			: ["materials.fonts"]),
		...changedStylePaths,
	];
}

export async function analyzeCapCut81FontReferencePair({
	afterDraftDirectory,
	beforeDraftDirectory,
	fontLabel,
	targetText,
}: {
	afterDraftDirectory: string;
	beforeDraftDirectory: string;
	fontLabel: string;
	targetText: string;
}): Promise<CapCut81FontReferencePair> {
	if (fontLabel.trim().length === 0 || targetText.length === 0) {
		throw new Error("Font label and target text must be non-empty.");
	}
	const [before, after] = await Promise.all([
		inspectCapCut81FontReferenceDraft({
			draftDirectory: beforeDraftDirectory,
			targetText,
		}),
		inspectCapCut81FontReferenceDraft({
			draftDirectory: afterDraftDirectory,
			targetText,
		}),
	]);
	if (before.canonicalDraftDirectory === after.canonicalDraftDirectory) {
		throw new Error(
			"Before and after font references must be separate snapshots."
		);
	}
	if (
		before.targetMaterialId !== after.targetMaterialId ||
		before.nonFontTargetSha256 !== after.nonFontTargetSha256
	) {
		throw new Error(
			"Font reference pair changed non-font target semantics or material identity."
		);
	}
	const changedPaths = collectChangedPaths({
		after: after.binding,
		before: before.binding,
	});
	if (changedPaths.length === 0) {
		throw new Error("Font reference pair contains no font-field change.");
	}
	return {
		after,
		before,
		changedPaths,
		fontLabel: fontLabel.trim(),
		schema: FONT_REFERENCE_SCHEMA,
		schemaVersion: FONT_REFERENCE_SCHEMA_VERSION,
		targetText,
	};
}

export async function writeCapCut81FontReference({
	outputPath,
	reference,
}: {
	outputPath: string;
	reference: CapCut81FontReferencePair;
}): Promise<void> {
	if (extname(outputPath).toLowerCase() !== ".json") {
		throw new Error("CapCut font reference output must be a .json file.");
	}
	const absoluteOutputPath = resolve(outputPath);
	await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut font reference output directory",
		path: dirname(absoluteOutputPath),
	});
	await writeFile(
		absoluteOutputPath,
		`${JSON.stringify(reference, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx", mode: 0o600 }
	);
}
