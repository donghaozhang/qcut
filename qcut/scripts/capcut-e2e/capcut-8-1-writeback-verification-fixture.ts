import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
	CAPCUT_8_1_WRITEBACK_VERIFICATION_FILE_NAME,
	type CapCut81WritebackVerificationManifest,
} from "./capcut-8-1-writeback-verification-contract.js";
import type {
	CapCut81WritebackTimingSnapshot,
	DraftImportCommitDto,
	TimelineTrack,
	WritebackRuntime,
} from "./capcut-8-1-writeback-verification-runtime.js";
import {
	parseJsonRecord,
	readRegularFileSnapshot,
	requireRecord,
} from "./disposable-store-control-file.js";

const CONTROLLED_TARGET_START_DELTA_SECONDS = 0.5;
const CONTROLLED_TARGET_DURATION_DELTA_SECONDS = -0.5;
const CONTROLLED_SOURCE_START_DELTA_SECONDS = 0.25;
const SENTINEL_KEY = "qcut_unknown_sentinel";
const SENTINEL_VALUE = {
	token: "jyi-015-controlled-sentinel-v1",
	nested: { enabled: true, values: ["alpha", 17, null] },
};

export interface CapCut81SourceReceipt {
	receiptId: string;
	fileCount: number;
	rootContentByteLength: number;
	rootContentSha256: string;
	targetAppVersion: string;
}

export function assertVerification(
	condition: unknown,
	message: string
): asserts condition {
	if (!condition) throw new Error(message);
}

export function sha256Bytes({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPathWithin({
	candidate,
	parent,
}: {
	candidate: string;
	parent: string;
}): boolean {
	const pathFromParent = relative(parent, candidate);
	return (
		pathFromParent === "" ||
		(!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
	);
}

export function requireSafeCaseId({ caseId }: { caseId: string }): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(caseId)) {
		throw new Error(
			"case-id must contain only letters, digits, dot, underscore, and dash."
		);
	}
}

export async function readSourceReceipt({
	path,
	profileId,
}: {
	path: string;
	profileId: string;
}): Promise<CapCut81SourceReceipt> {
	const snapshot = await readRegularFileSnapshot({
		label: "CapCut envelope source receipt",
		path,
	});
	const receipt = parseJsonRecord({
		bytes: snapshot.bytes,
		label: "CapCut envelope source receipt",
	});
	assertVerification(
		receipt.schema === "qcut.capcut-envelope-capture-receipt" &&
			receipt.schemaVersion === 1 &&
			typeof receipt.receiptId === "string" &&
			receipt.profileId === profileId,
		"Source receipt is not a CapCut 8.1 envelope capture receipt."
	);
	const targetApp = requireRecord({
		label: "CapCut envelope source receipt targetApp",
		value: receipt.targetApp,
	});
	const source = requireRecord({
		label: "CapCut envelope source receipt source",
		value: receipt.source,
	});
	const envelopeCapture = requireRecord({
		label: "CapCut envelope source receipt envelopeCapture",
		value: receipt.envelopeCapture,
	});
	assertVerification(
		typeof targetApp.version === "string" && targetApp.version === "8.1.1",
		"Source receipt must bind CapCut 8.1.1."
	);
	assertVerification(
		Number.isSafeInteger(source.fileCount) && Number(source.fileCount) > 0,
		"Source receipt has an invalid file count."
	);
	assertVerification(
		Array.isArray(envelopeCapture.entries),
		"Source receipt has no entries."
	);
	const rootEntry = envelopeCapture.entries.find(
		(entry) => isJsonRecord(entry) && entry.relativePath === "draft_info.json"
	);
	assertVerification(
		isJsonRecord(rootEntry),
		"Source receipt does not bind draft_info.json."
	);
	assertVerification(
		typeof rootEntry.sha256 === "string" &&
			/^[0-9a-f]{64}$/u.test(rootEntry.sha256) &&
			Number.isSafeInteger(rootEntry.byteLength) &&
			Number(rootEntry.byteLength) > 0,
		"Source receipt draft_info.json evidence is invalid."
	);
	return {
		receiptId: receipt.receiptId,
		fileCount: Number(source.fileCount),
		rootContentByteLength: Number(rootEntry.byteLength),
		rootContentSha256: rootEntry.sha256,
		targetAppVersion: targetApp.version,
	};
}

function getRootIdentity({ content }: { content: Record<string, unknown> }): {
	timelineId: string;
	videoSegment: Record<string, unknown>;
} {
	assertVerification(
		typeof content.id === "string",
		"CapCut root timeline id is missing."
	);
	assertVerification(
		Array.isArray(content.tracks),
		"CapCut tracks are missing."
	);
	const videoTrack = content.tracks.find(
		(track) => isJsonRecord(track) && track.type === "video"
	);
	assertVerification(
		isJsonRecord(videoTrack),
		"CapCut draft has no video track."
	);
	assertVerification(
		Array.isArray(videoTrack.segments),
		"CapCut video segments are missing."
	);
	const videoSegment = videoTrack.segments[0];
	assertVerification(
		isJsonRecord(videoSegment),
		"CapCut draft has no video segment."
	);
	return { timelineId: content.id, videoSegment };
}

export async function addControlledSentinel({
	buildActiveContentMirrorPaths,
	draftDirectory,
	originalContent,
}: {
	buildActiveContentMirrorPaths: WritebackRuntime["buildActiveContentMirrorPaths"];
	draftDirectory: string;
	originalContent: Record<string, unknown>;
}): Promise<{
	activeMirrorRelativePaths: readonly [string, string, string, string];
	isolatedSourceBytes: Uint8Array;
	timelineId: string;
}> {
	const copiedContent = structuredClone(originalContent);
	const { timelineId, videoSegment } = getRootIdentity({
		content: copiedContent,
	});
	assertVerification(
		!(SENTINEL_KEY in videoSegment),
		"Source already contains QCut sentinel."
	);
	videoSegment[SENTINEL_KEY] = SENTINEL_VALUE;
	const isolatedSourceBytes = new TextEncoder().encode(
		JSON.stringify(copiedContent)
	);
	const activeMirrorRelativePaths = buildActiveContentMirrorPaths({
		timelineId,
	});
	await Promise.all(
		activeMirrorRelativePaths.map((relativePath) =>
			writeFile(join(draftDirectory, relativePath), isolatedSourceBytes)
		)
	);
	return { activeMirrorRelativePaths, isolatedSourceBytes, timelineId };
}

export async function readDigests({
	draftDirectory,
	relativePaths,
}: {
	draftDirectory: string;
	relativePaths: readonly string[];
}): Promise<string[]> {
	return Promise.all(
		relativePaths.map(async (relativePath) =>
			sha256Bytes({ bytes: await readFile(join(draftDirectory, relativePath)) })
		)
	);
}

export function buildTimingSnapshot({
	bundle,
	tracks,
}: {
	bundle: DraftImportCommitDto["bundle"];
	tracks: TimelineTrack[];
}): CapCut81WritebackTimingSnapshot {
	const timelineDurationByElementId: Record<string, number> = {};
	for (const timeline of bundle.document.timelines) {
		for (const track of timeline.tracks) {
			for (const segment of track.segments) {
				const internalId = bundle.internalIdBySemanticId[segment.id];
				if (internalId !== undefined) {
					timelineDurationByElementId[internalId] =
						segment.targetRange.durationUs / 1_000_000;
				}
			}
		}
	}
	return { tracks, timelineDurationByElementId };
}

export function applyControlledTimingEdit({
	bundle,
	snapshot,
}: {
	bundle: DraftImportCommitDto["bundle"];
	snapshot: CapCut81WritebackTimingSnapshot;
}): void {
	const root = bundle.document.timelines.find(({ isRoot }) => isRoot);
	const semanticSegment = root?.tracks
		.find(({ kind }) => kind === "video")
		?.segments.find(({ kind }) => kind === "video");
	assertVerification(
		semanticSegment !== undefined,
		"Imported document has no video segment."
	);
	assertVerification(
		semanticSegment.sourceRange !== undefined,
		"Imported video segment has no source range."
	);
	const internalId = bundle.internalIdBySemanticId[semanticSegment.id];
	assertVerification(
		internalId !== undefined,
		"Imported video segment has no QCut id."
	);
	const element = snapshot.tracks
		.flatMap(({ elements }) => elements)
		.find(({ id }) => id === internalId);
	assertVerification(
		element?.type === "media",
		"Imported QCut video element is missing."
	);
	const currentDuration =
		snapshot.timelineDurationByElementId[element.id] ?? Number.NaN;
	const nextDuration =
		currentDuration + CONTROLLED_TARGET_DURATION_DELTA_SECONDS;
	assertVerification(
		Number.isFinite(nextDuration) && nextDuration > 0.5,
		"Imported video segment is too short for the controlled timing edit."
	);
	const playbackRate = element.playbackRate ?? 1;
	const nextTrimStart =
		element.trimStart + CONTROLLED_SOURCE_START_DELTA_SECONDS;
	const nextTrimEnd =
		element.duration - nextTrimStart - nextDuration * playbackRate;
	assertVerification(
		Number.isFinite(nextTrimEnd) && nextTrimEnd >= 0,
		"Imported video source is too short for the controlled timing edit."
	);
	element.startTime += CONTROLLED_TARGET_START_DELTA_SECONDS;
	element.trimStart = nextTrimStart;
	element.trimEnd = nextTrimEnd;
	(snapshot.timelineDurationByElementId as Record<string, number>)[element.id] =
		nextDuration;
}

export function hasControlledSentinel({
	content,
}: {
	content: unknown;
}): boolean {
	assertVerification(
		isJsonRecord(content),
		"Written CapCut content must be an object."
	);
	const writtenSentinel = getRootIdentity({ content }).videoSegment[
		SENTINEL_KEY
	];
	return JSON.stringify(writtenSentinel) === JSON.stringify(SENTINEL_VALUE);
}

export function arraysEqual({
	left,
	right,
}: {
	left: readonly string[];
	right: readonly string[];
}): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

export async function writeVerificationManifest({
	manifest,
	outputDirectory,
}: {
	manifest: CapCut81WritebackVerificationManifest;
	outputDirectory: string;
}): Promise<void> {
	const finalPath = join(
		outputDirectory,
		CAPCUT_8_1_WRITEBACK_VERIFICATION_FILE_NAME
	);
	const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(manifest, null, "\t")}\n`, {
		flag: "wx",
		mode: 0o600,
	});
	await rename(temporaryPath, finalPath);
}
