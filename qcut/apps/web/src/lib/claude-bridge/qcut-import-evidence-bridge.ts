import { describeQCutImportMedia } from "@qcut/editor-core/draft-interop";
import { platform } from "@qcut/platform-core";
import { storageService } from "@/lib/storage/storage-service";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import {
	QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
	type QCutPersistedImportEvidenceMedia,
	type QCutPersistedImportEvidenceRendererRequest,
	type QCutPersistedImportEvidenceSnapshot,
} from "../../../../../electron/types/qcut-import-evidence-api";

interface QCutImportEvidenceStorage {
	loadAllMediaItems: (projectId: string) => Promise<MediaItem[]>;
	loadProject: ({ id }: { id: string }) => Promise<TProject | null>;
	loadTimeline: ({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) => Promise<TimelineTrack[] | null>;
}

interface QCutImportEvidenceRendererBridge {
	onSnapshotRequest: (
		callback: (data: QCutPersistedImportEvidenceRendererRequest) => void
	) => void;
	removeListeners: () => void;
	sendSnapshotResponse: (
		requestId: string,
		result?: QCutPersistedImportEvidenceSnapshot,
		error?: string
	) => void;
}

interface PersistedImportEvidencePass {
	binding: QCutPersistedImportEvidenceSnapshot["binding"];
	media: QCutPersistedImportEvidenceMedia[];
	project: QCutPersistedImportEvidenceSnapshot["project"];
	tracks: TimelineTrack[];
}

function requireProjectBinding({
	expectedBundleDigest,
	project,
}: {
	expectedBundleDigest: string;
	project: TProject;
}): NonNullable<TProject["draftInterop"]> {
	const binding = project.draftInterop;
	if (binding === undefined) {
		throw new Error("Project is not bound to an imported draft.");
	}
	if (binding.bundleDigest !== expectedBundleDigest) {
		throw new Error("Project import bundle digest does not match the request.");
	}
	return binding;
}

function requirePositiveNumber({
	label,
	value,
}: {
	label: string;
	value: number | undefined;
}): number {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
	return value;
}

function requireEvidenceMediaType({
	type,
}: {
	type: MediaItem["type"];
}): QCutPersistedImportEvidenceMedia["type"] {
	if (type !== "audio" && type !== "image" && type !== "video") {
		throw new Error(`Imported media type '${type}' cannot be evidenced.`);
	}
	return type;
}

async function captureEvidencePass({
	expectedBundleDigest,
	projectId,
	storage,
}: {
	expectedBundleDigest: string;
	projectId: string;
	storage: QCutImportEvidenceStorage;
}): Promise<PersistedImportEvidencePass> {
	const project = await storage.loadProject({ id: projectId });
	if (project === null) {
		throw new Error(`Persisted project '${projectId}' was not found.`);
	}
	const binding = requireProjectBinding({ expectedBundleDigest, project });
	if (project.currentSceneId.length === 0) {
		throw new Error("Persisted project has no current scene.");
	}
	const [tracks, mediaItems] = await Promise.all([
		storage.loadTimeline({
			projectId,
			sceneId: project.currentSceneId,
		}),
		storage.loadAllMediaItems(projectId),
	]);
	if (tracks === null) {
		throw new Error("Persisted project timeline was not found.");
	}
	const describedMedia = await describeQCutImportMedia({
		media: mediaItems.map((mediaItem) => ({
			bytes: mediaItem.file,
			id: mediaItem.id,
			type: requireEvidenceMediaType({ type: mediaItem.type }),
		})),
	});
	const media = describedMedia
		.map((item): QCutPersistedImportEvidenceMedia => {
			if (item.sha256 === undefined) {
				throw new Error(`Persisted media '${item.id}' has no SHA-256.`);
			}
			return {
				byteLength: item.byteLength,
				id: item.id,
				sha256: item.sha256,
				type: item.type,
			};
		})
		.sort((left, right) => left.id.localeCompare(right.id));
	return {
		binding: {
			bundleDigest: binding.bundleDigest,
			importId: binding.importId,
			profileId: binding.profileId,
		},
		media,
		project: {
			fps: requirePositiveNumber({ label: "Project FPS", value: project.fps }),
			height: requirePositiveNumber({
				label: "Project canvas height",
				value: project.canvasSize.height,
			}),
			id: project.id,
			name: project.name,
			sceneId: project.currentSceneId,
			width: requirePositiveNumber({
				label: "Project canvas width",
				value: project.canvasSize.width,
			}),
		},
		tracks,
	};
}

export async function capturePersistedQCutImportEvidence({
	appVersion,
	now = () => new Date(),
	request,
	storage = storageService,
}: {
	appVersion: string;
	now?: () => Date;
	request: QCutPersistedImportEvidenceRendererRequest["request"];
	storage?: QCutImportEvidenceStorage;
}): Promise<QCutPersistedImportEvidenceSnapshot> {
	if (appVersion.length === 0 || appVersion.includes("\0")) {
		throw new Error("QCut app version is invalid.");
	}
	const first = await captureEvidencePass({
		expectedBundleDigest: request.expectedBundleDigest,
		projectId: request.projectId,
		storage,
	});
	const second = await captureEvidencePass({
		expectedBundleDigest: request.expectedBundleDigest,
		projectId: request.projectId,
		storage,
	});
	if (JSON.stringify(first) !== JSON.stringify(second)) {
		throw new Error("Persisted import changed while evidence was captured.");
	}
	return {
		...second,
		capture: {
			appVersion,
			capturedAtIso: now().toISOString(),
			readPasses: 2,
			source: "qcut-renderer-persisted-storage",
		},
		schema: QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1,
	};
}

function getImportEvidenceBridge(): QCutImportEvidenceRendererBridge | null {
	try {
		const claude = platform().claude as
			| ({ importEvidence?: QCutImportEvidenceRendererBridge } & Record<
					string,
					unknown
			  >)
			| undefined;
		return claude?.importEvidence ?? null;
	} catch {
		return null;
	}
}

let activeCapture = false;

async function handleSnapshotRequest({
	bridge,
	data,
}: {
	bridge: QCutImportEvidenceRendererBridge;
	data: QCutPersistedImportEvidenceRendererRequest;
}): Promise<void> {
	if (activeCapture) {
		bridge.sendSnapshotResponse(
			data.requestId,
			undefined,
			"A persisted import evidence capture is already running."
		);
		return;
	}
	activeCapture = true;
	try {
		const result = await capturePersistedQCutImportEvidence({
			appVersion: data.appVersion,
			request: data.request,
		});
		bridge.sendSnapshotResponse(data.requestId, result);
	} catch (error) {
		bridge.sendSnapshotResponse(
			data.requestId,
			undefined,
			error instanceof Error ? error.message : String(error)
		);
	} finally {
		activeCapture = false;
	}
}

export function setupQCutImportEvidenceBridge(): void {
	const bridge = getImportEvidenceBridge();
	if (bridge === null) return;
	bridge.onSnapshotRequest((data) => {
		void handleSnapshotRequest({ bridge, data });
	});
}

export function cleanupQCutImportEvidenceBridge(): void {
	getImportEvidenceBridge()?.removeListeners();
}
