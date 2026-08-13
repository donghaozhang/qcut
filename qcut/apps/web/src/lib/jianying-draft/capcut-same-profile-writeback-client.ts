import { readVerifiedEnvelopePayload } from "@/lib/jianying-draft/envelope-key-adapter";
import type { TProject } from "@/types/project";
import type { JianyingSameProfileWritebackAPI } from "@/types/electron/api-jianying-same-profile-writeback";
import {
	CAPCUT_8_1_PROFILE_ID,
	prepareCapCut81SameProfileWriteback,
	type CapCut81SameProfilePrepareIssue,
	type CapCut81WritebackTimingSnapshot,
} from "@qcut/editor-core/jianying-draft";
import { encodeBytesAsBase64 } from "./bytes-base64";

export type CapCut81WritebackClientResult =
	| { ok: true; outcome: "unchanged" }
	| { ok: true; outcome: "cancelled" }
	| {
			ok: true;
			outcome: "written";
			draftDirectory: string;
			contentSha256: string;
			replacedMirrorCount: 4;
			transactionId: string;
			warnings: string[];
	  }
	| {
			ok: false;
			reason:
				| "project-not-imported"
				| "writeback-not-ready"
				| "baseline-document-missing"
				| "envelope-unavailable"
				| "prepare-blocked"
				| "qcut-state-changed"
				| "bridge-unavailable"
				| "directory-selection-failed"
				| "writeback-failed";
			message: string;
			issues?: CapCut81SameProfilePrepareIssue[];
			draftDirectory?: string;
			selectionToken?: string;
	  };

export interface CapCut81WritebackClientDeps {
	getBridge?: () => JianyingSameProfileWritebackAPI | null;
	readVerifiedEnvelope?: typeof readVerifiedEnvelopePayload;
	verifySnapshotCurrent?: (options: {
		project: TProject;
		snapshot: CapCut81WritebackTimingSnapshot;
	}) => Promise<boolean>;
}

function getBridgeDefault(): JianyingSameProfileWritebackAPI | null {
	if (typeof window === "undefined") return null;
	return window.electronAPI?.jianyingSameProfileWriteback ?? null;
}

export async function runCapCut81SameProfileWriteback({
	deps = {},
	project,
	snapshot,
}: {
	deps?: CapCut81WritebackClientDeps;
	project: TProject;
	snapshot: CapCut81WritebackTimingSnapshot;
}): Promise<CapCut81WritebackClientResult> {
	const binding = project.draftInterop;
	if (binding === undefined || binding.profileId !== CAPCUT_8_1_PROFILE_ID) {
		return {
			ok: false,
			reason: "project-not-imported",
			message: "This project is not bound to an exact CapCut 8.1 import.",
		};
	}
	if (binding.writeback.status !== "ready") {
		return {
			ok: false,
			reason: "writeback-not-ready",
			message: `Same-profile writeback is unavailable: ${binding.writeback.reason}.`,
		};
	}
	if (binding.baselineDocument === undefined) {
		return {
			ok: false,
			reason: "baseline-document-missing",
			message: "This imported project predates normalized baseline retention.",
		};
	}
	if (binding.envelope === undefined) {
		return {
			ok: false,
			reason: "envelope-unavailable",
			message: "The encrypted foreign source envelope is unavailable.",
		};
	}

	const readVerifiedEnvelope =
		deps.readVerifiedEnvelope ?? readVerifiedEnvelopePayload;
	const verified = await readVerifiedEnvelope({
		envelope: binding.envelope,
	});
	if (!verified.ok) {
		return {
			ok: false,
			reason: "envelope-unavailable",
			message: verified.message ?? "Encrypted source verification failed.",
		};
	}

	const prepared = prepareCapCut81SameProfileWriteback({
		baselineDocument: binding.baselineDocument,
		bytesByPath: verified.value.bytesByPath,
		envelope: binding.envelope,
		internalIdBySemanticId: binding.internalIdBySemanticId,
		snapshot,
	});
	if (!prepared.ok) {
		return {
			ok: false,
			reason: "prepare-blocked",
			message: "The current QCut edits cannot be safely written to CapCut 8.1.",
			issues: prepared.issues,
		};
	}
	if (!prepared.changed) return { ok: true, outcome: "unchanged" };

	const bridge = (deps.getBridge ?? getBridgeDefault)();
	if (bridge === null) {
		return {
			ok: false,
			reason: "bridge-unavailable",
			message: "Same-profile writeback requires the QCut desktop app.",
		};
	}
	const selected = await bridge.chooseCapCut81DraftDirectory();
	if (!selected.ok) {
		return {
			ok: false,
			reason: "directory-selection-failed",
			message: selected.error.message,
		};
	}
	if (selected.value === null) return { ok: true, outcome: "cancelled" };
	if (
		deps.verifySnapshotCurrent !== undefined &&
		!(await deps.verifySnapshotCurrent({ project, snapshot }))
	) {
		return {
			ok: false,
			reason: "qcut-state-changed",
			message:
				"The QCut project changed while the destination was selected. Review and retry the writeback.",
		};
	}

	const committed = await bridge.commitCapCut81Writeback({
		contentBase64: encodeBytesAsBase64({ bytes: prepared.contentBytes }),
		expectedSourceSha256: prepared.expectedSourceSha256,
		profileId: binding.profileId,
		selectionToken: selected.value.selectionToken,
	});
	if (!committed.ok) {
		return {
			ok: false,
			reason: "writeback-failed",
			message: committed.error.message,
			draftDirectory: selected.value.draftDirectory,
			selectionToken: selected.value.selectionToken,
		};
	}
	return {
		ok: true,
		outcome: "written",
		draftDirectory: selected.value.draftDirectory,
		contentSha256: committed.value.contentSha256,
		replacedMirrorCount: committed.value.replacedMirrorCount,
		transactionId: committed.value.transactionId,
		warnings: [...committed.value.warnings],
	};
}

export async function recoverCapCut81SameProfileWriteback({
	deps = {},
	selectionToken,
}: {
	deps?: Pick<CapCut81WritebackClientDeps, "getBridge">;
	selectionToken: string;
}) {
	const bridge = (deps.getBridge ?? getBridgeDefault)();
	if (bridge === null) {
		return {
			ok: false as const,
			reason: "bridge-unavailable" as const,
			message: "Same-profile recovery requires the QCut desktop app.",
		};
	}
	return bridge.recoverCapCut81Writeback({ selectionToken });
}
