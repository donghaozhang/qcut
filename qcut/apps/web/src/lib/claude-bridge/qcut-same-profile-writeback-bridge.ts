import { platform } from "@qcut/platform-core";
import {
	recoverCapCut81SameProfileWriteback,
	runCapCut81SameProfileWriteback,
	type CapCut81WritebackClientResult,
} from "@/lib/jianying-draft/capcut-same-profile-writeback-client";
import { isCapCutWritebackSnapshotCurrent } from "@/lib/jianying-draft/capcut-same-profile-writeback-current";
import { createCapCut81WritebackTimingSnapshot } from "@/lib/jianying-draft/capcut-same-profile-writeback-snapshot";
import { storageService } from "@/lib/storage/storage-service";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackBlockedReason,
	type QCutSameProfileWritebackFailureReason,
	type QCutSameProfileWritebackRendererRequest,
	type QCutSameProfileWritebackRequest,
	type QCutSameProfileWritebackResult,
} from "../../../../../electron/types/qcut-same-profile-writeback-api";

interface QCutSameProfileWritebackStorage {
	loadProject: ({ id }: { id: string }) => Promise<TProject | null>;
	loadTimeline: ({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) => Promise<TimelineTrack[] | null>;
}

interface QCutSameProfileWritebackRendererBridge {
	onRequest: (
		callback: (data: QCutSameProfileWritebackRendererRequest) => void
	) => void;
	removeListeners: () => void;
	sendResponse: (
		requestId: string,
		result?: QCutSameProfileWritebackResult,
		error?: string
	) => void;
}

type RunWriteback = typeof runCapCut81SameProfileWriteback;
type RecoverWriteback = typeof recoverCapCut81SameProfileWriteback;

const RESULT_BASE = {
	schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	schemaVersion: 1,
} as const;

function blockedResult({
	issues = [],
	message,
	projectId,
	reason,
}: {
	issues?: Extract<
		QCutSameProfileWritebackResult,
		{ operation: "writeback"; outcome: "blocked" }
	>["issues"];
	message: string;
	projectId: string;
	reason: QCutSameProfileWritebackBlockedReason;
}): QCutSameProfileWritebackResult {
	return {
		...RESULT_BASE,
		issues,
		message,
		operation: "writeback",
		outcome: "blocked",
		projectId,
		reason,
	};
}

function writebackFailure({
	message,
	projectId,
	reason,
	recoveryToken = null,
}: {
	message: string;
	projectId: string;
	reason: QCutSameProfileWritebackFailureReason;
	recoveryToken?: string | null;
}): QCutSameProfileWritebackResult {
	return {
		...RESULT_BASE,
		message,
		operation: "writeback",
		outcome: "failed",
		projectId,
		reason,
		recoveryToken,
	};
}

function recoveryFailure({
	message,
	reason,
}: {
	message: string;
	reason: QCutSameProfileWritebackFailureReason;
}): QCutSameProfileWritebackResult {
	return {
		...RESULT_BASE,
		message,
		operation: "recover",
		outcome: "failed",
		reason,
	};
}

function mapWritebackResult({
	projectId,
	result,
}: {
	projectId: string;
	result: CapCut81WritebackClientResult;
}): QCutSameProfileWritebackResult {
	if (result.ok) {
		if (result.outcome === "written") {
			return {
				...RESULT_BASE,
				contentSha256: result.contentSha256,
				operation: "writeback",
				outcome: "written",
				projectId,
				replacedMirrorCount: result.replacedMirrorCount,
				transactionId: result.transactionId,
				warnings: [...result.warnings],
			};
		}
		return {
			...RESULT_BASE,
			operation: "writeback",
			outcome: result.outcome,
			projectId,
		};
	}

	switch (result.reason) {
		case "project-not-imported":
		case "writeback-not-ready":
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
		case "writeback-failed":
			return writebackFailure({
				message: result.message,
				projectId,
				reason: result.reason,
				recoveryToken: result.selectionToken ?? null,
			});
	}
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

async function executeRecovery({
	recoverWriteback,
	recoveryToken,
}: {
	recoverWriteback: RecoverWriteback;
	recoveryToken: string;
}): Promise<QCutSameProfileWritebackResult> {
	try {
		const result = await recoverWriteback({ selectionToken: recoveryToken });
		if (!result.ok) {
			return recoveryFailure({
				message: "message" in result ? result.message : result.error.message,
				reason:
					"reason" in result && result.reason === "bridge-unavailable"
						? "bridge-unavailable"
						: "recovery-failed",
			});
		}
		return {
			...RESULT_BASE,
			operation: "recover",
			outcome: "recovered",
			recoveryAction: result.value.action,
			transactionId: result.value.transactionId ?? null,
			warnings: [...result.value.warnings],
		};
	} catch (error) {
		return recoveryFailure({
			message: errorMessage({ error }),
			reason: "unexpected",
		});
	}
}

export async function executePersistedQCutSameProfileWriteback({
	recoverWriteback = recoverCapCut81SameProfileWriteback,
	request,
	runWriteback = runCapCut81SameProfileWriteback,
	storage = storageService,
}: {
	recoverWriteback?: RecoverWriteback;
	request: QCutSameProfileWritebackRequest;
	runWriteback?: RunWriteback;
	storage?: QCutSameProfileWritebackStorage;
}): Promise<QCutSameProfileWritebackResult> {
	if (request.action === "recover") {
		return executeRecovery({
			recoverWriteback,
			recoveryToken: request.recoveryToken,
		});
	}

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
		const snapshot = createCapCut81WritebackTimingSnapshot({
			fps: project.fps ?? 30,
			tracks,
		});
		const result = await runWriteback({
			deps: {
				verifySnapshotCurrent: async ({
					project: capturedProject,
					snapshot: capturedSnapshot,
				}) => {
					const currentProject = await storage.loadProject({ id: project.id });
					if (currentProject === null) return false;
					const currentTracks = await storage.loadTimeline({
						projectId: currentProject.id,
						sceneId: currentProject.currentSceneId,
					});
					if (currentTracks === null) return false;
					return isCapCutWritebackSnapshotCurrent({
						capturedProject,
						capturedSnapshot,
						currentProject,
						currentTracks,
					});
				},
			},
			project,
			snapshot,
		});
		return mapWritebackResult({ projectId: project.id, result });
	} catch (error) {
		return writebackFailure({
			message: errorMessage({ error }),
			projectId: request.projectId,
			reason: "unexpected",
		});
	}
}

function getWritebackBridge(): QCutSameProfileWritebackRendererBridge | null {
	try {
		const claude = platform().claude as
			| ({
					sameProfileWriteback?: QCutSameProfileWritebackRendererBridge;
			  } & Record<string, unknown>)
			| undefined;
		return claude?.sameProfileWriteback ?? null;
	} catch {
		return null;
	}
}

let activeOperation = false;

function busyResult({
	request,
}: {
	request: QCutSameProfileWritebackRequest;
}): QCutSameProfileWritebackResult {
	const message =
		"Another same-profile writeback operation is already running.";
	return request.action === "writeback"
		? blockedResult({
				message,
				projectId: request.projectId,
				reason: "operation-busy",
			})
		: recoveryFailure({ message, reason: "operation-busy" });
}

async function handleRequest({
	bridge,
	data,
}: {
	bridge: QCutSameProfileWritebackRendererBridge;
	data: QCutSameProfileWritebackRendererRequest;
}): Promise<void> {
	if (activeOperation) {
		bridge.sendResponse(data.requestId, busyResult({ request: data.request }));
		return;
	}
	activeOperation = true;
	try {
		bridge.sendResponse(
			data.requestId,
			await executePersistedQCutSameProfileWriteback({ request: data.request })
		);
	} catch (error) {
		bridge.sendResponse(data.requestId, undefined, errorMessage({ error }));
	} finally {
		activeOperation = false;
	}
}

export function setupQCutSameProfileWritebackBridge(): void {
	const bridge = getWritebackBridge();
	if (bridge === null) return;
	bridge.onRequest((data) => {
		void handleRequest({ bridge, data });
	});
}

export function cleanupQCutSameProfileWritebackBridge(): void {
	getWritebackBridge()?.removeListeners();
}
