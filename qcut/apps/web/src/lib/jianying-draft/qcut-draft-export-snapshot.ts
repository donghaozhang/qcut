import type {
	JianyingDraftIssue,
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { normalizeMediaColorSettings } from "@/lib/color/color-properties";
import { resolveColorFilterSettings } from "@/lib/filters/filter-resolver";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { buildTimelineDurationByElementId } from "./same-profile-writeback-snapshot";

const DEFAULT_PROJECT_FPS = 30;
const DEFAULT_PROJECT_BACKGROUND_COLOR = "#000000";

export type QCutDraftExportSnapshotAdapterIssueCode =
	| "MISSING_MEDIA"
	| "MISSING_MEDIA_SOURCE_PATH"
	| "INVALID_MEDIA_SOURCE_PATH";

export interface QCutDraftExportSnapshotAdapterIssue
	extends Omit<
		JianyingDraftIssue,
		"code" | "elementId" | "mediaId" | "severity" | "trackId"
	> {
	code: QCutDraftExportSnapshotAdapterIssueCode;
	elementId?: string;
	mediaId: string;
	severity: "error";
	trackId?: string;
}

export type QCutDraftExportSnapshotAdapterResult =
	| {
			ok: true;
			issues: [];
			snapshot: QCutDraftExportSnapshotV1;
			sourceCandidatesByMediaId: Readonly<Record<string, readonly string[]>>;
	  }
	| {
			ok: false;
			issues: QCutDraftExportSnapshotAdapterIssue[];
	  };

export interface CreateQCutDraftExportSnapshotOptions {
	getPathForFile: (file: File) => string | null | undefined;
	mediaItems: readonly MediaItem[];
	project: TProject;
	sourcePathExists?: ({
		sourcePath,
	}: {
		sourcePath: string;
	}) => Promise<boolean>;
	tracks: readonly TimelineTrack[];
}

interface TimelineMediaReference {
	elementId: string;
	mediaId: string;
	trackId: string;
}

interface SourcePathResolution {
	attemptedCandidates: string[];
	hadCandidate: boolean;
	sourceCandidates: string[];
	sourcePath?: string;
}

function cloneWithoutUndefined<T>({ value }: { value: T }): T {
	if (Array.isArray(value)) {
		return value.map((item) => cloneWithoutUndefined({ value: item })) as T;
	}
	if (value === null || typeof value !== "object") return value;

	const clone: Record<string, unknown> = {};
	for (const [key, nestedValue] of Object.entries(value)) {
		if (nestedValue === undefined) continue;
		clone[key] = cloneWithoutUndefined({ value: nestedValue });
	}
	return clone as T;
}

function getAbsoluteFileSystemPath({
	candidate,
}: {
	candidate: string | null | undefined;
}): string | undefined {
	if (typeof candidate !== "string") return undefined;
	const path = candidate.trim();
	if (!path || path.includes("\0")) return undefined;

	const isWindowsDrivePath = /^[A-Za-z]:[\\/]/u.test(path);
	const isWindowsUncPath = /^\\\\[^\\/]+[\\/][^\\/]+/u.test(path);
	const isPosixPath = path.startsWith("/");
	if (!isWindowsDrivePath && !isWindowsUncPath && !isPosixPath) {
		return undefined;
	}
	return path;
}

function getCandidateSummary({ candidate }: { candidate: string }): string {
	const normalized = candidate.replaceAll("\0", "").trim();
	const maximumLength = 160;
	return normalized.length > maximumLength
		? `${normalized.slice(0, maximumLength)}…`
		: normalized;
}

async function resolveMediaSourcePath({
	getPathForFile,
	mediaItem,
	sourcePathExists,
}: {
	getPathForFile: CreateQCutDraftExportSnapshotOptions["getPathForFile"];
	mediaItem: MediaItem;
	sourcePathExists: CreateQCutDraftExportSnapshotOptions["sourcePathExists"];
}): Promise<SourcePathResolution> {
	const rawCandidates = [
		mediaItem.localPath,
		mediaItem.importMetadata?.originalPath,
	].flatMap((candidate) =>
		typeof candidate === "string" && candidate.trim().length > 0
			? [candidate]
			: []
	);
	let filePathLookupFailed = false;
	try {
		const filePath = getPathForFile(mediaItem.file);
		if (typeof filePath === "string" && filePath.trim().length > 0) {
			rawCandidates.push(filePath);
		}
	} catch {
		filePathLookupFailed = true;
	}

	const sourceCandidates = [
		...new Set(
			rawCandidates.flatMap((candidate) => {
				const sourcePath = getAbsoluteFileSystemPath({ candidate });
				return sourcePath ? [sourcePath] : [];
			})
		),
	];
	const attemptedCandidates = [
		...rawCandidates.map((candidate) => getCandidateSummary({ candidate })),
		...(filePathLookupFailed ? ["[File path lookup failed]"] : []),
	];
	if (!sourcePathExists) {
		return {
			attemptedCandidates,
			hadCandidate: attemptedCandidates.length > 0,
			sourceCandidates,
			sourcePath: sourceCandidates[0],
		};
	}

	const candidateAvailability = await Promise.all(
		sourceCandidates.map(async (sourcePath) => {
			try {
				return await sourcePathExists({ sourcePath });
			} catch {
				return false;
			}
		})
	);
	const sourcePath = sourceCandidates.find(
		(_candidate, index) => candidateAvailability[index]
	);
	return {
		attemptedCandidates,
		hadCandidate: attemptedCandidates.length > 0,
		sourceCandidates: sourcePath
			? [
					sourcePath,
					...sourceCandidates.filter((candidate) => candidate !== sourcePath),
				]
			: sourceCandidates,
		sourcePath,
	};
}

function collectTimelineMediaReferences({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): TimelineMediaReference[] {
	const referencesByMediaId = new Map<string, TimelineMediaReference>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "media" && element.type !== "sticker") continue;
			if (referencesByMediaId.has(element.mediaId)) continue;
			referencesByMediaId.set(element.mediaId, {
				elementId: element.id,
				mediaId: element.mediaId,
				trackId: track.id,
			});
		}
	}
	return [...referencesByMediaId.values()];
}

function mapExportMedia({
	mediaItem,
	sourcePath,
}: {
	mediaItem: MediaItem;
	sourcePath: string;
}): QCutDraftExportMedia {
	const base = {
		id: mediaItem.id,
		name: mediaItem.name,
		sourcePath,
	};
	switch (mediaItem.type) {
		case "video":
			return {
				...base,
				type: "video",
				duration: mediaItem.duration ?? 0,
				width: mediaItem.width ?? 0,
				height: mediaItem.height ?? 0,
			};
		case "image":
			return {
				...base,
				type: "image",
				width: mediaItem.width ?? 0,
				height: mediaItem.height ?? 0,
			};
		case "audio":
			return {
				...base,
				type: "audio",
				duration: mediaItem.duration ?? 0,
			};
	}
}

function resolveMediaElementColor({
	element,
}: {
	element: MediaElement;
}): MediaElement {
	return {
		...element,
		color: resolveColorFilterSettings({
			settings: normalizeMediaColorSettings({ element }),
		}),
	};
}

function cloneTracksForSnapshot({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): TimelineTrack[] {
	const resolvedTracks = tracks.map((track) => ({
		...track,
		elements: track.elements.map((element) =>
			element.type === "media" ? resolveMediaElementColor({ element }) : element
		),
	}));
	return cloneWithoutUndefined({ value: resolvedTracks });
}

function createMissingMediaIssue({
	reference,
}: {
	reference: TimelineMediaReference;
}): QCutDraftExportSnapshotAdapterIssue {
	return {
		code: "MISSING_MEDIA",
		elementId: reference.elementId,
		mediaId: reference.mediaId,
		message: `Timeline element ${reference.elementId} references missing media ${reference.mediaId}.`,
		severity: "error",
		trackId: reference.trackId,
	};
}

function createSourcePathIssue({
	attemptedCandidates,
	hadCandidate,
	mediaId,
	reference,
}: {
	attemptedCandidates: readonly string[];
	hadCandidate: boolean;
	mediaId: string;
	reference?: TimelineMediaReference;
}): QCutDraftExportSnapshotAdapterIssue {
	const referenceContext = reference
		? ` referenced by timeline element ${reference.elementId}`
		: " in the project media bin";
	return {
		code: hadCandidate
			? "INVALID_MEDIA_SOURCE_PATH"
			: "MISSING_MEDIA_SOURCE_PATH",
		...(reference ? { elementId: reference.elementId } : {}),
		mediaId,
		message: hadCandidate
			? `Media ${mediaId}${referenceContext} has no available absolute filesystem source path. Checked candidates: ${attemptedCandidates.join(
					", "
				)}.`
			: `Media ${mediaId}${referenceContext} has no filesystem source path.`,
		severity: "error",
		...(reference ? { trackId: reference.trackId } : {}),
	};
}

function isCapCut81DefaultCanvasEquivalent({
	backgroundColor,
	backgroundType,
}: {
	backgroundColor: string;
	backgroundType: "color" | "blur";
}): boolean {
	if (backgroundType !== "color") return false;
	const normalizedColor = backgroundColor.replaceAll(" ", "").toLowerCase();
	return normalizedColor === "#000000" || normalizedColor === "#000000ff";
}

function createProjectSnapshot({
	project,
}: {
	project: TProject;
}): QCutDraftExportSnapshotV1["project"] {
	const backgroundColor =
		project.backgroundColor ?? DEFAULT_PROJECT_BACKGROUND_COLOR;
	const backgroundType = project.backgroundType ?? "color";
	return cloneWithoutUndefined({
		value: {
			audioMix: project.audioMix,
			id: project.id,
			name: project.name,
			sceneId: project.currentSceneId,
			width: project.canvasSize.width,
			height: project.canvasSize.height,
			fps: project.fps ?? DEFAULT_PROJECT_FPS,
			backgroundColor: isCapCut81DefaultCanvasEquivalent({
				backgroundColor,
				backgroundType,
			})
				? "transparent"
				: backgroundColor,
			backgroundType,
		},
	});
}

export async function createQCutDraftExportSnapshot({
	getPathForFile,
	mediaItems,
	project,
	sourcePathExists,
	tracks,
}: CreateQCutDraftExportSnapshotOptions): Promise<QCutDraftExportSnapshotAdapterResult> {
	const mediaById = new Map(
		mediaItems.map((mediaItem) => [mediaItem.id, mediaItem])
	);
	const referenceByMediaId = new Map(
		collectTimelineMediaReferences({ tracks }).map((reference) => [
			reference.mediaId,
			reference,
		])
	);
	const media: QCutDraftExportMedia[] = [];
	const issues: QCutDraftExportSnapshotAdapterIssue[] = [];
	const sourceCandidatesByMediaId: Record<string, readonly string[]> = {};

	for (const reference of referenceByMediaId.values()) {
		if (!mediaById.has(reference.mediaId)) {
			issues.push(createMissingMediaIssue({ reference }));
		}
	}

	const pathResolutions = await Promise.all(
		mediaItems.map(async (mediaItem) => ({
			mediaItem,
			pathResolution: await resolveMediaSourcePath({
				getPathForFile,
				mediaItem,
				sourcePathExists,
			}),
		}))
	);
	for (const { mediaItem, pathResolution } of pathResolutions) {
		if (!pathResolution.sourcePath) {
			issues.push(
				createSourcePathIssue({
					attemptedCandidates: pathResolution.attemptedCandidates,
					hadCandidate: pathResolution.hadCandidate,
					mediaId: mediaItem.id,
					reference: referenceByMediaId.get(mediaItem.id),
				})
			);
			continue;
		}

		sourceCandidatesByMediaId[mediaItem.id] = pathResolution.sourceCandidates;
		media.push(
			mapExportMedia({
				mediaItem,
				sourcePath: pathResolution.sourcePath,
			})
		);
	}

	if (issues.length > 0) return { ok: false, issues };

	const fps = project.fps ?? DEFAULT_PROJECT_FPS;
	const snapshot = cloneWithoutUndefined<QCutDraftExportSnapshotV1>({
		value: {
			schemaVersion: 1,
			project: createProjectSnapshot({ project }),
			tracks: cloneTracksForSnapshot({ tracks }),
			media,
			timelineDurationByElementId: buildTimelineDurationByElementId({
				fps,
				tracks,
			}),
		},
	});
	return { ok: true, issues: [], snapshot, sourceCandidatesByMediaId };
}
