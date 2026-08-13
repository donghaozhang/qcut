import type { JianyingProjectExportAPI } from "@/types/electron/api-jianying-project-export";
import { readVerifiedEnvelopePayload } from "@/lib/jianying-draft/envelope-key-adapter";
import type { TProject } from "@/types/project";
import {
	JIANYING_11_3_PROFILE_IDS,
	isDraftProfileWritable,
	prepareJianying113SameProfileWriteback,
	type Jianying113SameProfilePrepareIssue,
	type Jianying113WritebackTimingSnapshot,
} from "@qcut/editor-core/jianying-draft";
import { encodeBytesAsBase64 } from "./bytes-base64";

export type Jianying113ProjectExportClientResult =
	| { ok: true; outcome: "cancelled" }
	| {
			ok: true;
			outcome: "exported";
			changed: boolean;
			contentRelativePath: string;
			contentSha256: string;
			patchCount: number;
			projectDirectory: string;
			subdraftId: string;
			transactionId: string;
			warnings: string[];
	  }
	| {
			ok: false;
			reason:
				| "project-not-imported"
				| "baseline-document-missing"
				| "envelope-unavailable"
				| "profile-not-writable"
				| "prepare-blocked"
				| "qcut-state-changed"
				| "bridge-unavailable"
				| "directory-selection-failed"
				| "export-failed";
			message: string;
			issues?: Jianying113SameProfilePrepareIssue[];
			projectDirectory?: string;
	  };

export interface Jianying113ProjectExportClientDeps {
	getBridge?: () => JianyingProjectExportAPI | null;
	isProfileWritable?: typeof isDraftProfileWritable;
	readVerifiedEnvelope?: typeof readVerifiedEnvelopePayload;
	verifySnapshotCurrent?: (options: {
		project: TProject;
		snapshot: Jianying113WritebackTimingSnapshot;
	}) => Promise<boolean>;
}

function getBridgeDefault(): JianyingProjectExportAPI | null {
	if (typeof window === "undefined") return null;
	return window.electronAPI?.jianyingProjectExport ?? null;
}

export async function runJianying113ProjectExport({
	deps = {},
	project,
	snapshot,
}: {
	deps?: Jianying113ProjectExportClientDeps;
	project: TProject;
	snapshot: Jianying113WritebackTimingSnapshot;
}): Promise<Jianying113ProjectExportClientResult> {
	const binding = project.draftInterop;
	const profileId = JIANYING_11_3_PROFILE_IDS.find(
		(candidate) => candidate === binding?.profileId
	);
	if (binding === undefined || profileId === undefined) {
		return {
			ok: false,
			reason: "project-not-imported",
			message:
				"This project is not bound to an exact supported Jianying Professional 11.3 import.",
		};
	}
	if (binding.baselineDocument === undefined) {
		return {
			ok: false,
			reason: "baseline-document-missing",
			message: "This imported project has no normalized Jianying baseline.",
		};
	}
	if (binding.envelope === undefined) {
		return {
			ok: false,
			reason: "envelope-unavailable",
			message: "The encrypted Jianying source envelope is unavailable.",
		};
	}
	const isProfileWritable = deps.isProfileWritable ?? isDraftProfileWritable;
	if (
		binding.writeback.status !== "ready" ||
		!isProfileWritable({ profileId })
	) {
		return {
			ok: false,
			reason: "profile-not-writable",
			message:
				"This exact Jianying profile has no stable real-app save/reopen receipt. Re-import after the profile is promoted to writable.",
		};
	}

	const readVerifiedEnvelope =
		deps.readVerifiedEnvelope ?? readVerifiedEnvelopePayload;
	const verified = await readVerifiedEnvelope({ envelope: binding.envelope });
	if (!verified.ok) {
		return {
			ok: false,
			reason: "envelope-unavailable",
			message:
				verified.message ?? "Encrypted Jianying source verification failed.",
		};
	}

	const prepared = prepareJianying113SameProfileWriteback({
		baselineDocument: binding.baselineDocument,
		bytesByPath: verified.value.bytesByPath,
		envelope: binding.envelope,
		internalIdBySemanticId: binding.internalIdBySemanticId,
		profileId,
		snapshot,
	});
	if (!prepared.ok) {
		return {
			ok: false,
			reason: "prepare-blocked",
			message:
				"The current QCut edits cannot be represented safely in this Jianying profile.",
			issues: prepared.issues,
		};
	}

	const bridge = (deps.getBridge ?? getBridgeDefault)();
	if (bridge === null) {
		return {
			ok: false,
			reason: "bridge-unavailable",
			message: "Jianying project export requires the QCut desktop app.",
		};
	}
	const selected = await bridge.chooseJianying113ProjectExportDirectory();
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
				"The QCut project changed while the Jianying directories were selected. Review and retry the export.",
		};
	}

	const committed = await bridge.commitJianying113ProjectExport({
		contentBase64: encodeBytesAsBase64({ bytes: prepared.contentBytes }),
		expectedSourceSha256: prepared.expectedSourceSha256,
		profileId,
		selectionToken: selected.value.selectionToken,
	});
	if (!committed.ok) {
		return {
			ok: false,
			reason: "export-failed",
			message: committed.error.message,
			projectDirectory: selected.value.projectDirectory,
		};
	}
	return {
		ok: true,
		outcome: "exported",
		changed: prepared.changed,
		contentRelativePath: committed.value.contentRelativePath,
		contentSha256: committed.value.contentSha256,
		patchCount: prepared.patches.length,
		projectDirectory: selected.value.projectDirectory,
		subdraftId: committed.value.subdraftId,
		transactionId: committed.value.transactionId,
		warnings: [...committed.value.warnings],
	};
}
