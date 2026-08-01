import { createHash } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import {
	collectFontBindingChangedPaths,
	fontBindingContainsExactLabel,
} from "./font-reference-binding.js";
import type { CapCut81FontBindingSnapshot } from "./font-reference-binding.js";
import {
	assertRootTimelineSemanticAgreement,
	parseCapCut81FontReferenceDraft,
} from "./font-reference-draft.js";
import type { CapCut81TextSegmentEvidence } from "./font-reference-draft.js";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import { requireCanonicalPath } from "./gui-regression-filesystem.js";

const MAXIMUM_FONT_REFERENCE_DRAFT_BYTES = 256 * 1024 * 1024;
const FONT_REFERENCE_SCHEMA = "qcut.capcut-8-1.font-reference" as const;
const FONT_REFERENCE_SCHEMA_VERSION = 2 as const;
export const CAPCUT_FONT_REFERENCE_VERIFICATION_STATUS =
	"unverified-draft-self-report" as const;

export type { CapCut81FontBindingSnapshot } from "./font-reference-binding.js";

interface DraftInfoEvidence {
	bytes: number;
	path: string;
	sha256: string;
}

export interface CapCut81FontReferenceDraftEvidence {
	binding: CapCut81FontBindingSnapshot;
	canonicalDraftDirectory: string;
	canonicalDraftSemanticSha256: string;
	normalizedDraftSemanticSha256: string;
	rootDraftInfo: DraftInfoEvidence;
	targetMaterialId: string;
	textSegment: CapCut81TextSegmentEvidence;
	timelineDraftInfo: DraftInfoEvidence;
	timelineId: string;
	updateTime: number;
}

export interface CapCut81FontReferencePair {
	after: CapCut81FontReferenceDraftEvidence;
	before: CapCut81FontReferenceDraftEvidence;
	changedPaths: readonly string[];
	fontLabel: string;
	schema: typeof FONT_REFERENCE_SCHEMA;
	schemaVersion: typeof FONT_REFERENCE_SCHEMA_VERSION;
	targetText: string;
	verificationStatus: typeof CAPCUT_FONT_REFERENCE_VERIFICATION_STATUS;
}

function sha256Bytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function sha256Value({ value }: { value: unknown }): string {
	return createHash("sha256")
		.update(JSON.stringify(value), "utf8")
		.digest("hex");
}

async function readDraftInfo({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<{ bytes: Buffer; evidence: DraftInfoEvidence }> {
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

async function resolveSingleTimeline({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<{ timelineId: string; timelinePath: string }> {
	const timelinesDirectory = await requireCanonicalPath({
		expectedKind: "directory",
		label: "CapCut font reference Timelines directory",
		path: join(draftDirectory, "Timelines"),
	});
	const entries = await readdir(timelinesDirectory.canonicalPath, {
		withFileTypes: true,
	});
	if (entries.some((entry) => entry.isSymbolicLink())) {
		throw new Error(
			"CapCut font reference Timelines must not contain symlinks."
		);
	}
	const timelineIds = entries
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => name)
		.sort();
	if (timelineIds.length !== 1) {
		throw new Error(
			`CapCut font reference must contain exactly one timeline; found ${timelineIds.length}.`
		);
	}
	const timelineId = timelineIds[0];
	if (!timelineId) {
		throw new Error("CapCut font reference timeline is missing.");
	}
	return {
		timelineId,
		timelinePath: join(timelinesDirectory.canonicalPath, timelineId),
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
	const { timelineId, timelinePath } = await resolveSingleTimeline({
		draftDirectory: draft.canonicalPath,
	});
	const [rootDraftInfo, timelineDraftInfo] = await Promise.all([
		readDraftInfo({
			label: "CapCut font reference root draft_info.json",
			path: join(draft.canonicalPath, "draft_info.json"),
		}),
		readDraftInfo({
			label: "CapCut font reference timeline draft_info.json",
			path: join(timelinePath, "draft_info.json"),
		}),
	]);
	const root = parseCapCut81FontReferenceDraft({
		draftInfoText: rootDraftInfo.bytes.toString("utf8"),
		label: "Root draft_info.json",
		targetText,
	});
	const timeline = parseCapCut81FontReferenceDraft({
		draftInfoText: timelineDraftInfo.bytes.toString("utf8"),
		label: "Timeline draft_info.json",
		targetText,
	});
	assertRootTimelineSemanticAgreement({ root, timeline });
	return {
		binding: root.binding,
		canonicalDraftDirectory: draft.canonicalPath,
		canonicalDraftSemanticSha256: sha256Value({
			value: root.canonicalDraft,
		}),
		normalizedDraftSemanticSha256: sha256Value({
			value: root.normalizedDraft,
		}),
		rootDraftInfo: rootDraftInfo.evidence,
		targetMaterialId: root.materialId,
		textSegment: root.textSegment,
		timelineDraftInfo: timelineDraftInfo.evidence,
		timelineId,
		updateTime: root.updateTime,
	};
}

function assertSameNonFontDraft({
	after,
	before,
}: {
	after: CapCut81FontReferenceDraftEvidence;
	before: CapCut81FontReferenceDraftEvidence;
}): void {
	const sameSnapshotIdentity =
		before.timelineId === after.timelineId &&
		before.targetMaterialId === after.targetMaterialId;
	if (!sameSnapshotIdentity) {
		throw new Error(
			"Font reference pair changed timeline or target material identity."
		);
	}
	if (
		before.normalizedDraftSemanticSha256 !== after.normalizedDraftSemanticSha256
	) {
		throw new Error(
			"Font reference pair changed draft semantics outside the allowed target font bindings."
		);
	}
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
	const normalizedFontLabel = fontLabel.trim();
	if (normalizedFontLabel.length === 0 || targetText.length === 0) {
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
	assertSameNonFontDraft({ after, before });
	const changedPaths = collectFontBindingChangedPaths({
		after: after.binding,
		before: before.binding,
	});
	if (changedPaths.length === 0) {
		throw new Error(
			"Font reference pair contains no canonical font-identity binding change."
		);
	}
	if (changedPaths.every((path) => path === "materials.fonts")) {
		throw new Error(
			"Top-level materials.fonts cannot establish a target text font binding by itself."
		);
	}
	if (
		!fontBindingContainsExactLabel({
			binding: after.binding,
			fontLabel: normalizedFontLabel,
		})
	) {
		throw new Error(
			"After-draft font bindings must contain the exact UI font label."
		);
	}
	return {
		after,
		before,
		changedPaths,
		fontLabel: normalizedFontLabel,
		schema: FONT_REFERENCE_SCHEMA,
		schemaVersion: FONT_REFERENCE_SCHEMA_VERSION,
		targetText,
		verificationStatus: CAPCUT_FONT_REFERENCE_VERIFICATION_STATUS,
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
