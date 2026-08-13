import { platform } from "@qcut/platform-core";
import {
	commitLiveDraftImport,
	JianyingDraftImportClientError,
} from "@/lib/jianying-draft/jianying-draft-import-client";
import type { JianyingDraftImportAPI } from "@/types/electron/api-jianying-draft-import";
import {
	QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
	type QCutJianyingProjectImportRendererRequest,
	type QCutJianyingProjectImportRequest,
	type QCutJianyingProjectImportResult,
} from "../../../../../electron/types/qcut-jianying-project-import-api";

interface QCutJianyingProjectImportRendererBridge {
	onRequest: (
		callback: (data: QCutJianyingProjectImportRendererRequest) => void
	) => void;
	removeListeners: () => void;
	sendResponse: (
		requestId: string,
		result?: QCutJianyingProjectImportResult,
		error?: string
	) => void;
}

type CommitImport = typeof commitLiveDraftImport;

const RESULT_BASE = {
	schema: QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
	schemaVersion: 1,
} as const;

function failedResult({
	message,
	reason,
}: {
	message: string;
	reason: Extract<
		QCutJianyingProjectImportResult,
		{ outcome: "failed" }
	>["reason"];
}): QCutJianyingProjectImportResult {
	return { ...RESULT_BASE, message, outcome: "failed", reason };
}

function blockedResult({
	blockerFingerprints = [],
	message,
	profileId,
	reason,
	warningFingerprints = [],
}: {
	blockerFingerprints?: string[];
	message: string;
	profileId?: string;
	reason: Extract<
		QCutJianyingProjectImportResult,
		{ outcome: "blocked" }
	>["reason"];
	warningFingerprints?: string[];
}): QCutJianyingProjectImportResult {
	return {
		...RESULT_BASE,
		blockerFingerprints: [...blockerFingerprints].sort(),
		message,
		outcome: "blocked",
		...(profileId === undefined ? {} : { profileId }),
		reason,
		warningFingerprints: [...warningFingerprints].sort(),
	};
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function sameFingerprints({
	accepted,
	required,
}: {
	accepted: readonly string[];
	required: readonly string[];
}): boolean {
	if (accepted.length !== required.length) return false;
	const acceptedSorted = [...accepted].sort();
	const requiredSorted = [...required].sort();
	return requiredSorted.every(
		(fingerprint, index) => fingerprint === acceptedSorted[index]
	);
}

export async function executeLiveQCutJianyingProjectImport({
	bridge,
	commitImport = commitLiveDraftImport,
	request,
}: {
	bridge: JianyingDraftImportAPI | null;
	commitImport?: CommitImport;
	request: QCutJianyingProjectImportRequest;
}): Promise<QCutJianyingProjectImportResult> {
	if (bridge === null) {
		return failedResult({
			message: "Jianying draft import is unavailable in this QCut window.",
			reason: "bridge-unavailable",
		});
	}

	let planned: Awaited<ReturnType<JianyingDraftImportAPI["planDraftImport"]>>;
	try {
		planned = await bridge.planDraftImport({ draftPath: request.draftPath });
	} catch (error) {
		return failedResult({
			message: errorMessage({ error }),
			reason: "plan-failed",
		});
	}
	if (!planned.ok) {
		if (planned.error.code === "profile-not-exact") {
			return blockedResult({
				message: planned.error.message,
				reason: "profile-not-exact",
			});
		}
		if (planned.error.code === "plan-blocked") {
			return blockedResult({
				message: planned.error.message,
				reason: "plan-blocked",
			});
		}
		return failedResult({
			message: planned.error.message,
			reason: "plan-failed",
		});
	}

	const { inspect, plan } = planned.value;
	if (
		inspect.outcome !== "exact" ||
		plan.detectionOutcome !== "exact" ||
		plan.profileId === undefined
	) {
		return blockedResult({
			blockerFingerprints: plan.blockerFingerprints,
			message: "The draft does not match an exact Jianying profile.",
			profileId: plan.profileId,
			reason: "profile-not-exact",
			warningFingerprints: plan.warningFingerprints,
		});
	}
	if (!plan.canCommit || plan.blockerFingerprints.length > 0) {
		return blockedResult({
			blockerFingerprints: plan.blockerFingerprints,
			message: "The Jianying import plan contains blocking issues.",
			profileId: plan.profileId,
			reason: "plan-blocked",
			warningFingerprints: plan.warningFingerprints,
		});
	}
	if (
		!sameFingerprints({
			accepted: request.acceptedWarningFingerprints,
			required: plan.warningFingerprints,
		})
	) {
		return blockedResult({
			message:
				"Import requires explicit acceptance of every warning fingerprint.",
			profileId: plan.profileId,
			reason: "warning-acceptance-required",
			warningFingerprints: plan.warningFingerprints,
		});
	}
	if (
		inspect.sourceScope !== "selected-directory" &&
		inspect.sourceScope !== "compound-subdraft"
	) {
		return failedResult({
			message: "The Jianying import source scope is unavailable.",
			reason: "unexpected",
		});
	}

	try {
		const projectId = await commitImport({
			acceptedWarningFingerprints: [...plan.warningFingerprints],
			bridge,
			planToken: plan.planToken,
		});
		return {
			...RESULT_BASE,
			outcome: "imported",
			profileId: plan.profileId,
			projectId,
			reversible: true,
			...(inspect.selectedSubdraftId === undefined
				? {}
				: { selectedSubdraftId: inspect.selectedSubdraftId }),
			sourceScope: inspect.sourceScope,
			warningFingerprints: [...plan.warningFingerprints].sort(),
		};
	} catch (error) {
		return failedResult({
			message: errorMessage({ error }),
			reason:
				error instanceof JianyingDraftImportClientError
					? "commit-failed"
					: "unexpected",
		});
	}
}

function getCommandBridge(): QCutJianyingProjectImportRendererBridge | null {
	try {
		const claude = platform().claude as
			| ({
					jianyingProjectImport?: QCutJianyingProjectImportRendererBridge;
			  } & Record<string, unknown>)
			| undefined;
		return claude?.jianyingProjectImport ?? null;
	} catch {
		return null;
	}
}

function getDraftImportBridge(): JianyingDraftImportAPI | null {
	return window.electronAPI?.jianyingDraftImport ?? null;
}

let activeOperation = false;

async function handleRequest({
	bridge,
	data,
}: {
	bridge: QCutJianyingProjectImportRendererBridge;
	data: QCutJianyingProjectImportRendererRequest;
}): Promise<void> {
	if (activeOperation) {
		bridge.sendResponse(
			data.requestId,
			failedResult({
				message: "Another Jianying project import is already running.",
				reason: "operation-busy",
			})
		);
		return;
	}
	activeOperation = true;
	try {
		bridge.sendResponse(
			data.requestId,
			await executeLiveQCutJianyingProjectImport({
				bridge: getDraftImportBridge(),
				request: data.request,
			})
		);
	} catch (error) {
		bridge.sendResponse(data.requestId, undefined, errorMessage({ error }));
	} finally {
		activeOperation = false;
	}
}

export function setupQCutJianyingProjectImportBridge(): void {
	const bridge = getCommandBridge();
	if (bridge === null) return;
	bridge.onRequest((data) => {
		void handleRequest({ bridge, data });
	});
}

export function cleanupQCutJianyingProjectImportBridge(): void {
	getCommandBridge()?.removeListeners();
}
