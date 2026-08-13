import type { JianyingProjectExportAPI } from "@/types/electron/api-jianying-project-export";
import { readVerifiedEnvelopePayload } from "@/lib/jianying-draft/envelope-key-adapter";
import type { TProject } from "@/types/project";
import {
	JIANYING_11_3_BETA2_PROFILE_ID,
	prepareJianying113Beta2SameProfileWriteback,
	type Jianying113Beta2SameProfilePrepareIssue,
	type Jianying113Beta2WritebackTimingSnapshot,
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
			copiedFileCount: number;
			outputDirectory: string;
			patchCount: number;
			sourceProjectDirectory: string;
			subdraftId: string;
	  }
	| {
			ok: false;
			reason:
				| "project-not-imported"
				| "baseline-document-missing"
				| "envelope-unavailable"
				| "prepare-blocked"
				| "qcut-state-changed"
				| "bridge-unavailable"
				| "directory-selection-failed"
				| "export-failed";
			message: string;
			issues?: Jianying113Beta2SameProfilePrepareIssue[];
			outputParentDirectory?: string;
			sourceProjectDirectory?: string;
	  };

export interface Jianying113ProjectExportClientDeps {
	getBridge?: () => JianyingProjectExportAPI | null;
	readVerifiedEnvelope?: typeof readVerifiedEnvelopePayload;
	verifySnapshotCurrent?: (options: {
		project: TProject;
		snapshot: Jianying113Beta2WritebackTimingSnapshot;
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
	snapshot: Jianying113Beta2WritebackTimingSnapshot;
}): Promise<Jianying113ProjectExportClientResult> {
	const binding = project.draftInterop;
	if (
		binding === undefined ||
		binding.profileId !== JIANYING_11_3_BETA2_PROFILE_ID
	) {
		return {
			ok: false,
			reason: "project-not-imported",
			message:
				"This project is not bound to an exact Jianying Professional 11.3 beta 2 import.",
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

	// This publishes a new project copy, so it does not require in-place writeback capability.
	const prepared = prepareJianying113Beta2SameProfileWriteback({
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
	const selected = await bridge.chooseJianying113ProjectExportDirectories();
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
		draftName: project.name,
		expectedSourceSha256: prepared.expectedSourceSha256,
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		selectionToken: selected.value.selectionToken,
	});
	if (!committed.ok) {
		return {
			ok: false,
			reason: "export-failed",
			message: committed.error.message,
			outputParentDirectory: selected.value.outputParentDirectory,
			sourceProjectDirectory: selected.value.sourceProjectDirectory,
		};
	}
	return {
		ok: true,
		outcome: "exported",
		changed: prepared.changed,
		contentRelativePath: committed.value.contentRelativePath,
		contentSha256: committed.value.contentSha256,
		copiedFileCount: committed.value.copiedFileCount,
		outputDirectory: committed.value.outputDirectory,
		patchCount: prepared.patches.length,
		sourceProjectDirectory: selected.value.sourceProjectDirectory,
		subdraftId: committed.value.subdraftId,
	};
}
