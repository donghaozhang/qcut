import { join } from "node:path";

export const CAPCUT_GUI_CASE_IDS = [
	"native-text-sticker",
	"dissolve",
	"lut-mask",
] as const;

export type CapCutGuiCaseId = (typeof CAPCUT_GUI_CASE_IDS)[number];

export type CapCutGuiStepAction =
	| "capture-root-before"
	| "install-bundle"
	| "open-draft-first-time"
	| "capture-first-open"
	| "save-and-quit"
	| "reopen-draft"
	| "capture-reopen"
	| "export-video"
	| "capture-export"
	| "quit"
	| "capture-root-after";

export interface CapCutGuiCaseExpectation {
	caseId: CapCutGuiCaseId;
	checks: readonly {
		id: string;
		description: string;
		evidencePhase: "first-open" | "reopen" | "export";
	}[];
}

export interface CapCutGuiBundleCase {
	bundleDirectory: string;
	caseId: CapCutGuiCaseId;
	completeMarkerPath: string;
	draftDirectory: string;
	draftId: string;
	draftName: string;
	migrationManifestPath: string;
	verification: CapCutGuiBundleVerificationReport;
}

export interface CapCutGuiFileIntegrity {
	bytes: number;
	path: string;
	sha256: string;
}

export interface CapCutGuiAssetIntegrity {
	bytes: number;
	relativePath: string;
	sha256: string;
}

export interface CapCutGuiBundleVerificationReport {
	completeMarker: CapCutGuiFileIntegrity;
	content: {
		bytes: number;
		sha256: string;
	};
	copiedAssets: readonly CapCutGuiAssetIntegrity[];
	draftFileCount: number;
	draftFilesInventorySha256: string;
	draftFolderName: string;
	generatedAssets: readonly CapCutGuiAssetIntegrity[];
	ids: {
		draftId: string;
		placeholderId: string;
		projectId: string;
		timelineId: string;
	};
	migrationManifest: CapCutGuiFileIntegrity;
	outputDirectory: string;
	timelineMaterialsSize: number;
	totalDraftFileBytes: number;
}

export interface CapCutGuiRegressionStep {
	action: CapCutGuiStepAction;
	caseId?: CapCutGuiCaseId;
	description: string;
	evidencePaths: readonly string[];
	expectedCheckIds: readonly string[];
	sequence: number;
}

export const CAPCUT_GUI_CASE_EXPECTATIONS: readonly CapCutGuiCaseExpectation[] =
	[
		{
			caseId: "native-text-sticker",
			checks: [
				{
					description:
						"The editable title renders 剪映真实导入测试 ABC123 with no tofu or missing glyphs.",
					evidencePhase: "first-open",
					id: "native-title-cjk-visible",
				},
				{
					description:
						"The editable caption renders 原生字幕验证 ABC123 with no tofu or missing glyphs.",
					evidencePhase: "first-open",
					id: "native-caption-cjk-visible",
				},
				{
					description:
						"The PNG sticker keeps transparent pixels and does not reopen with an opaque background.",
					evidencePhase: "reopen",
					id: "transparent-sticker-reopen",
				},
				{
					description:
						"The exported video keeps the native title, caption, and transparent sticker appearance.",
					evidencePhase: "export",
					id: "native-elements-export",
				},
			],
		},
		{
			caseId: "dissolve",
			checks: [
				{
					description:
						"The frame immediately before the transition matches Clip A.",
					evidencePhase: "first-open",
					id: "dissolve-pre-frame",
				},
				{
					description:
						"The transition midpoint contains a visible blend of Clip A and Clip B.",
					evidencePhase: "first-open",
					id: "dissolve-mid-frame",
				},
				{
					description:
						"The frame immediately after the transition matches Clip B.",
					evidencePhase: "first-open",
					id: "dissolve-post-frame",
				},
				{
					description:
						"The native Dissolve remains attached after save, quit, and reopen.",
					evidencePhase: "reopen",
					id: "dissolve-reopen",
				},
				{
					description:
						"The exported transition supplies pre, midpoint, and post visual evidence.",
					evidencePhase: "export",
					id: "dissolve-export",
				},
			],
		},
		{
			caseId: "lut-mask",
			checks: [
				{
					description:
						"The second half visibly uses the static ellipse mask while the first half is unmasked.",
					evidencePhase: "first-open",
					id: "ellipse-mask-visible",
				},
				{
					description:
						"The second half visibly uses the 2x2 invert LUT while the first half remains untreated.",
					evidencePhase: "first-open",
					id: "invert-lut-visible",
				},
				{
					description:
						"The ellipse mask and invert LUT remain attached after save, quit, and reopen.",
					evidencePhase: "reopen",
					id: "lut-mask-reopen",
				},
				{
					description:
						"The exported video preserves both the ellipse mask and invert LUT appearance.",
					evidencePhase: "export",
					id: "lut-mask-export",
				},
			],
		},
	];

function getCaseExpectation({
	caseId,
}: {
	caseId: CapCutGuiCaseId;
}): CapCutGuiCaseExpectation {
	const expectation = CAPCUT_GUI_CASE_EXPECTATIONS.find(
		(candidate) => candidate.caseId === caseId
	);
	if (!expectation) {
		throw new Error(`Missing CapCut GUI expectation for ${caseId}.`);
	}
	return expectation;
}

function getEvidencePaths({
	caseId,
	evidenceDirectory,
	phase,
}: {
	caseId: CapCutGuiCaseId;
	evidenceDirectory: string;
	phase: "first-open" | "reopen" | "export";
}): string[] {
	const expectation = getCaseExpectation({ caseId });
	return expectation.checks
		.filter(({ evidencePhase }) => evidencePhase === phase)
		.map(({ id }) => join(evidenceDirectory, caseId, `${phase}-${id}.png`));
}

function getCheckIds({
	caseId,
	phase,
}: {
	caseId: CapCutGuiCaseId;
	phase: "first-open" | "reopen" | "export";
}): string[] {
	return getCaseExpectation({ caseId })
		.checks.filter(({ evidencePhase }) => evidencePhase === phase)
		.map(({ id }) => id);
}

export function buildCapCutGuiRegressionSteps({
	bundles,
	evidenceDirectory,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	evidenceDirectory: string;
}): CapCutGuiRegressionStep[] {
	const steps: Omit<CapCutGuiRegressionStep, "sequence">[] = [
		{
			action: "capture-root-before",
			description: "Fingerprint the empty disposable draft store.",
			evidencePaths: [join(evidenceDirectory, "root-fingerprint-before.json")],
			expectedCheckIds: [],
		},
	];

	for (const bundle of bundles) {
		steps.push({
			action: "install-bundle",
			caseId: bundle.caseId,
			description: `Install the verified ${bundle.caseId} bundle while CapCut is closed.`,
			evidencePaths: [
				join(evidenceDirectory, bundle.caseId, "install-result.json"),
			],
			expectedCheckIds: [],
		});
	}

	for (const bundle of bundles) {
		const firstOpenCheckIds = getCheckIds({
			caseId: bundle.caseId,
			phase: "first-open",
		});
		const reopenCheckIds = getCheckIds({
			caseId: bundle.caseId,
			phase: "reopen",
		});
		const exportCheckIds = getCheckIds({
			caseId: bundle.caseId,
			phase: "export",
		});
		steps.push(
			{
				action: "open-draft-first-time",
				caseId: bundle.caseId,
				description: `Launch CapCut 8.1.1 and open ${bundle.draftName}.`,
				evidencePaths: [],
				expectedCheckIds: [],
			},
			{
				action: "capture-first-open",
				caseId: bundle.caseId,
				description: `Capture first-open evidence for ${bundle.caseId}.`,
				evidencePaths: getEvidencePaths({
					caseId: bundle.caseId,
					evidenceDirectory,
					phase: "first-open",
				}),
				expectedCheckIds: firstOpenCheckIds,
			},
			{
				action: "save-and-quit",
				caseId: bundle.caseId,
				description: `Save ${bundle.draftName}, then quit CapCut completely.`,
				evidencePaths: [],
				expectedCheckIds: [],
			},
			{
				action: "reopen-draft",
				caseId: bundle.caseId,
				description: `Relaunch CapCut 8.1.1 and reopen ${bundle.draftName}.`,
				evidencePaths: [],
				expectedCheckIds: [],
			},
			{
				action: "capture-reopen",
				caseId: bundle.caseId,
				description: `Capture post-reopen evidence for ${bundle.caseId}.`,
				evidencePaths: getEvidencePaths({
					caseId: bundle.caseId,
					evidenceDirectory,
					phase: "reopen",
				}),
				expectedCheckIds: reopenCheckIds,
			},
			{
				action: "export-video",
				caseId: bundle.caseId,
				description: `Export ${bundle.draftName} to the isolated evidence directory.`,
				evidencePaths: [join(evidenceDirectory, bundle.caseId, "export.mp4")],
				expectedCheckIds: [],
			},
			{
				action: "capture-export",
				caseId: bundle.caseId,
				description: `Capture exported-video evidence for ${bundle.caseId}.`,
				evidencePaths: getEvidencePaths({
					caseId: bundle.caseId,
					evidenceDirectory,
					phase: "export",
				}),
				expectedCheckIds: exportCheckIds,
			},
			{
				action: "quit",
				caseId: bundle.caseId,
				description: "Quit CapCut before advancing to the next case.",
				evidencePaths: [],
				expectedCheckIds: [],
			}
		);
	}

	steps.push({
		action: "capture-root-after",
		description:
			"Fingerprint the disposable draft store after all reopen and export checks.",
		evidencePaths: [join(evidenceDirectory, "root-fingerprint-after.json")],
		expectedCheckIds: [],
	});

	return steps.map((step, index) => ({ ...step, sequence: index + 1 }));
}
