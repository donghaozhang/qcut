import { sep } from "node:path";
import type {
	CapCutGuiBundleCase,
	CapCutGuiCaseId,
} from "./gui-regression-contract.js";
import type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";

function getDraftEntries({
	bundle,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	rootFingerprint: CapCutGuiRootFingerprint;
}) {
	const folderName = bundle.verification.draftFolderName;
	const nestedPrefix = `${folderName}${sep}`;
	return rootFingerprint.storeInventory.filter(
		({ relativePath }) =>
			relativePath === folderName || relativePath.startsWith(nestedPrefix)
	);
}

function getNonCurrentDraftIds({
	bundles,
	currentCaseId,
	rootFingerprint,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	currentCaseId: CapCutGuiCaseId;
	rootFingerprint: CapCutGuiRootFingerprint;
}): string[] {
	const currentDraftId = bundles.find(
		({ caseId }) => caseId === currentCaseId
	)?.draftId;
	if (!currentDraftId) {
		throw new Error(`Current GUI case ${currentCaseId} is not planned.`);
	}
	return rootFingerprint.draftIds
		.filter((draftId) => draftId !== currentDraftId)
		.sort();
}

export function assertNonCurrentDraftsUnchanged({
	bundles,
	currentCaseId,
	rootFingerprintAfter,
	rootFingerprintBefore,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	currentCaseId: CapCutGuiCaseId;
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	rootFingerprintBefore: CapCutGuiRootFingerprint;
}): void {
	const beforeDraftIds = getNonCurrentDraftIds({
		bundles,
		currentCaseId,
		rootFingerprint: rootFingerprintBefore,
	});
	const afterDraftIds = getNonCurrentDraftIds({
		bundles,
		currentCaseId,
		rootFingerprint: rootFingerprintAfter,
	});
	if (JSON.stringify(beforeDraftIds) !== JSON.stringify(afterDraftIds)) {
		throw new Error(
			`${currentCaseId} step added or removed a non-current draft.`
		);
	}
	for (const draftId of beforeDraftIds) {
		const bundle = bundles.find((candidate) => candidate.draftId === draftId);
		if (!bundle) throw new Error(`Installed draft ${draftId} is not planned.`);
		const beforeEntries = getDraftEntries({
			bundle,
			rootFingerprint: rootFingerprintBefore,
		});
		const afterEntries = getDraftEntries({
			bundle,
			rootFingerprint: rootFingerprintAfter,
		});
		if (JSON.stringify(beforeEntries) !== JSON.stringify(afterEntries)) {
			throw new Error(
				`${bundle.caseId} non-current draft changed during ${currentCaseId}.`
			);
		}
	}
}
