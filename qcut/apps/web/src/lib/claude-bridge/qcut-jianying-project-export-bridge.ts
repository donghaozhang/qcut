import { platform } from "@qcut/platform-core";
import {
	runJianying113ProjectExport,
	type Jianying113ProjectExportClientResult,
} from "@/lib/jianying-draft/jianying-11-3-project-export-client";
import { isSameProfileWritebackSnapshotCurrent } from "@/lib/jianying-draft/same-profile-writeback-current";
import { createSameProfileWritebackTimingSnapshot } from "@/lib/jianying-draft/same-profile-writeback-snapshot";
import { storageService } from "@/lib/storage/storage-service";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import {
	QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	type QCutJianyingProjectExportBlockedReason,
	type QCutJianyingProjectExportFailureReason,
	type QCutJianyingProjectExportRendererRequest,
	type QCutJianyingProjectExportRequest,
	type QCutJianyingProjectExportResult,
} from "../../../../../electron/types/qcut-jianying-project-export-api";

interface QCutJianyingProjectExportStorage {
	loadProject: ({ id }: { id: string }) => Promise<TProject | null>;
	loadTimeline: ({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) => Promise<TimelineTrack[] | null>;
}

interface QCutJianyingProjectExportRendererBridge {
	onRequest: (
		callback: (data: QCutJianyingProjectExportRendererRequest) => void
	) => void;
	removeListeners: () => void;
	sendResponse: (
		requestId: string,
		result?: QCutJianyingProjectExportResult,
		error?: string
	) => void;
}

type RunProjectExport = typeof runJianying113ProjectExport;

const RESULT_BASE = {
	schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	schemaVersion: 1,
} as const;

function blockedResult({
	issues = [],
	message,
	projectId,
	reason,
}: {
	issues?: Extract<
		QCutJianyingProjectExportResult,
		{ outcome: "blocked" }
	>["issues"];
	message: string;
	projectId: string;
	reason: QCutJianyingProjectExportBlockedReason;
}): QCutJianyingProjectExportResult {
	return {
		...RESULT_BASE,
		issues,
		message,
		outcome: "blocked",
		projectId,
		reason,
	};
}

function failureResult({
	message,
	projectDirectory = null,
	projectId,
	reason,
}: {
	message: string;
	projectDirectory?: string | null;
	projectId: string;
	reason: QCutJianyingProjectExportFailureReason;
}): QCutJianyingProjectExportResult {
	return {
		...RESULT_BASE,
		message,
		outcome: "failed",
		projectDirectory,
		projectId,
		reason,
	};
}

function mapProjectExportResult({
	projectId,
	result,
}: {
	projectId: string;
	result: Jianying113ProjectExportClientResult;
}): QCutJianyingProjectExportResult {
	if (result.ok) {
		if (result.outcome === "cancelled") {
			return { ...RESULT_BASE, outcome: "cancelled", projectId };
		}
		return {
			...RESULT_BASE,
			changed: result.changed,
			contentRelativePath: result.contentRelativePath,
			contentSha256: result.contentSha256,
			outcome: "exported",
			patchCount: result.patchCount,
			projectDirectory: result.projectDirectory,
			projectId,
			subdraftId: result.subdraftId,
			transactionId: result.transactionId,
			warnings: [...result.warnings],
		};
	}

	switch (result.reason) {
		case "project-not-imported":
		case "baseline-document-missing":
		case "envelope-unavailable":
		case "prepare-blocked":
		case "qcut-state-changed":
			return blockedResult({
				issues: result.issues?.map((issue) => ({ ...issue })) ?? [],
				message: result.message,
				projectId,
				reason: result.reason,
			});
		case "bridge-unavailable":
		case "directory-selection-failed":
		case "export-failed":
			return failureResult({
				message: result.message,
				projectDirectory: result.projectDirectory,
				projectId,
				reason: result.reason,
			});
	}
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

export async function executePersistedQCutJianyingProjectExport({
	request,
	runExport = runJianying113ProjectExport,
	storage = storageService,
}: {
	request: QCutJianyingProjectExportRequest;
	runExport?: RunProjectExport;
	storage?: QCutJianyingProjectExportStorage;
}): Promise<QCutJianyingProjectExportResult> {
	try {
		const project = await storage.loadProject({ id: request.projectId });
		if (project === null) {
			return blockedResult({
				message: `Persisted project '${request.projectId}' was not found.`,
				projectId: request.projectId,
				reason: "project-not-found",
			});
		}
		if (project.currentSceneId.length === 0) {
			return blockedResult({
				message: "Persisted project has no current scene.",
				projectId: project.id,
				reason: "timeline-not-found",
			});
		}
		const tracks = await storage.loadTimeline({
			projectId: project.id,
			sceneId: project.currentSceneId,
		});
		if (tracks === null) {
			return blockedResult({
				message: "Persisted project timeline was not found.",
				projectId: project.id,
				reason: "timeline-not-found",
			});
		}
		const snapshot = createSameProfileWritebackTimingSnapshot({
			fps: project.fps ?? 30,
			tracks,
		});
		const result = await runExport({
			deps: {
				verifySnapshotCurrent: async ({
					project: capturedProject,
					snapshot: capturedSnapshot,
				}) => {
					const currentProject = await storage.loadProject({ id: project.id });
					if (
						currentProject === null ||
						currentProject.currentSceneId.length === 0
					) {
						return false;
					}
					const currentTracks = await storage.loadTimeline({
						projectId: currentProject.id,
						sceneId: currentProject.currentSceneId,
					});
					if (currentTracks === null) return false;
					return isSameProfileWritebackSnapshotCurrent({
						capturedProject,
						capturedSnapshot,
						currentProject,
						currentTracks,
						requireWritebackReady: false,
					});
				},
			},
			project,
			snapshot,
		});
		return mapProjectExportResult({ projectId: project.id, result });
	} catch (error) {
		return failureResult({
			message: errorMessage({ error }),
			projectId: request.projectId,
			reason: "unexpected",
		});
	}
}

function getProjectExportBridge(): QCutJianyingProjectExportRendererBridge | null {
	try {
		const claude = platform().claude as
			| ({
					jianyingProjectExport?: QCutJianyingProjectExportRendererBridge;
			  } & Record<string, unknown>)
			| undefined;
		return claude?.jianyingProjectExport ?? null;
	} catch {
		return null;
	}
}

let activeOperation = false;

async function handleRequest({
	bridge,
	data,
}: {
	bridge: QCutJianyingProjectExportRendererBridge;
	data: QCutJianyingProjectExportRendererRequest;
}): Promise<void> {
	if (activeOperation) {
		bridge.sendResponse(
			data.requestId,
			blockedResult({
				message: "Another Jianying project export is already running.",
				projectId: data.request.projectId,
				reason: "operation-busy",
			})
		);
		return;
	}
	activeOperation = true;
	try {
		bridge.sendResponse(
			data.requestId,
			await executePersistedQCutJianyingProjectExport({ request: data.request })
		);
	} catch (error) {
		bridge.sendResponse(data.requestId, undefined, errorMessage({ error }));
	} finally {
		activeOperation = false;
	}
}

export function setupQCutJianyingProjectExportBridge(): void {
	const bridge = getProjectExportBridge();
	if (bridge === null) return;
	bridge.onRequest((data) => {
		void handleRequest({ bridge, data });
	});
}

export function cleanupQCutJianyingProjectExportBridge(): void {
	getProjectExportBridge()?.removeListeners();
}
