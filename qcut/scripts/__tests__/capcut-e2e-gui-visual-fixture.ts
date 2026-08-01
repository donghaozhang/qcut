import {
	copyFile,
	mkdtemp,
	mkdir,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	CAPCUT_GUI_CASE_EXPECTATIONS,
	CAPCUT_GUI_CASE_IDS,
	buildCapCutGuiRegressionSteps,
	type CapCutGuiBundleCase,
} from "../capcut-e2e/gui-regression-contract.js";
import { requireGuiEvidenceFiles } from "../capcut-e2e/gui-regression-evidence.js";
import type {
	CapCutGuiRegressionExecutionResult,
	CapCutGuiRegressionPlan,
} from "../capcut-e2e/gui-regression-runner.js";
import { writeCapCutGuiVisualExtractionManifest } from "../capcut-e2e/gui-visual-extraction.js";
import { compareTransparentSticker } from "../capcut-e2e/visual-alpha.js";
import {
	deriveOverallVisualStatus,
	type VisualFileEvidence,
	type VisualOracleManifest,
} from "../capcut-e2e/visual-contract.js";
import {
	getDissolveFileName,
	getDissolveSampleId,
} from "../capcut-e2e/visual-dissolve.js";
import { buildDissolveFramePlan } from "../capcut-e2e/visual-frame-plan.js";
import { describeVisualFile } from "../capcut-e2e/visual-files.js";
import { CAPCUT_E2E_FIXTURE_SPEC } from "../capcut-e2e/spec.js";
import {
	buildFixtureFinalDraftVerifications,
	VERIFIED_STICKER_ASSET_CONTENT,
} from "./capcut-e2e-gui-visual-draft-fixture.js";
import {
	buildFixtureDissolveComparison,
	buildForgedLutMaskComparison,
} from "./capcut-e2e-gui-visual-comparison-fixture.js";
import {
	buildFixtureLutMaskComparison,
	createGuiVisualMediaFixtures,
} from "./capcut-e2e-gui-visual-lut-fixture.js";

const temporaryDirectories: string[] = [];

export interface GuiVisualBridgeFixture {
	evidenceDirectory: string;
	extractionManifestPath: string;
	guiPlanPath: string;
	guiResultPath: string;
	oracle: VisualOracleManifest;
	rootDirectory: string;
	visualOracleManifestPath: string;
}

async function writeEvidenceFile({
	path,
	value,
}: {
	path: string;
	value: string;
}) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, value, "utf8");
}

async function writeGuiStepEvidence({
	exportTemplatePath,
	isExport,
	path,
	replacementPath,
	sequence,
}: {
	exportTemplatePath: string;
	isExport: boolean;
	path: string;
	replacementPath: string | null;
	sequence: number;
}) {
	await mkdir(dirname(path), { recursive: true });
	if (replacementPath) {
		await copyFile(replacementPath, path);
		return;
	}
	if (isExport) {
		await copyFile(exportTemplatePath, path);
		return;
	}
	await writeFile(path, `GUI evidence step ${sequence}: ${path}`, "utf8");
}

async function createGuiArtifacts({
	bundleManifestPath,
	evidenceDirectory,
	forgedTextLutMask,
	rootDirectory,
	runId,
	verifiedVisuals,
}: {
	bundleManifestPath: string;
	evidenceDirectory: string;
	forgedTextLutMask: boolean;
	rootDirectory: string;
	runId: string;
	verifiedVisuals: boolean;
}) {
	const ownerUid = process.getuid?.() ?? -1;
	const bundles = CAPCUT_GUI_CASE_IDS.map((caseId) => ({
		caseId,
		draftName: `Fixture ${caseId}`,
	})) as unknown as CapCutGuiBundleCase[];
	const steps = buildCapCutGuiRegressionSteps({ bundles, evidenceDirectory });
	const plan = {
		bundleRun: { bundles, manifestPath: bundleManifestPath, runId },
		caseExpectations: CAPCUT_GUI_CASE_EXPECTATIONS,
		evidenceDirectory,
		identity: { processUid: ownerUid },
		schema: "qcut.capcut-e2e.gui-regression-plan",
		schemaVersion: 2,
		steps,
	} as unknown as CapCutGuiRegressionPlan;
	const guiPlanPath = join(evidenceDirectory, "gui-regression-plan.json");
	await writeFile(guiPlanPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
	const adapterSteps = steps.filter(
		({ action }) =>
			action !== "capture-root-before" && action !== "capture-root-after"
	);
	const mediaFixtures = await createGuiVisualMediaFixtures({ rootDirectory });
	const lutMaskReopenPath = join(
		evidenceDirectory,
		"lut-mask",
		"reopen-lut-mask-reopen.png"
	);
	await Promise.all(
		adapterSteps.flatMap(({ action, evidencePaths, sequence }) =>
			evidencePaths.map((path) =>
				writeGuiStepEvidence({
					exportTemplatePath: mediaFixtures.exportTemplatePath,
					isExport: action === "export-video",
					path,
					replacementPath:
						path === lutMaskReopenPath && !forgedTextLutMask
							? mediaFixtures.lutMask.expectedPath
							: null,
					sequence,
				})
			)
		)
	);
	const evidenceByStep = await Promise.all(
		adapterSteps.map(({ evidencePaths }) =>
			requireGuiEvidenceFiles({ evidencePaths, ownerUid })
		)
	);
	const stepResults = adapterSteps.map((step, index) => ({
		action: step.action,
		capturedEvidence: evidenceByStep[index] ?? [],
		...(step.caseId === undefined ? {} : { caseId: step.caseId }),
		expectedCheckIds: step.expectedCheckIds,
		rootFingerprintAfter: {},
		rootFingerprintBefore: {},
		sequence: step.sequence,
		visualVerificationStatus: "unverified",
	}));
	const finalDraftVerifications = await buildFixtureFinalDraftVerifications({
		rootDirectory,
		verifiedVisuals,
	});
	const result = {
		capturedEvidence: stepResults.flatMap(
			({ capturedEvidence }) => capturedEvidence
		),
		completedAt: "2026-08-01T00:01:00.000Z",
		draftVerifications: finalDraftVerifications,
		evidenceStatus: "capture-only",
		finalDraftVerifications,
		planPath: guiPlanPath,
		rootFingerprintAfter: {},
		runId,
		schema: "qcut.capcut-e2e.gui-regression-result",
		schemaVersion: 3,
		stepResults,
		stepsCompleted: steps.length,
		verifiedCheckIds: [],
		visualVerificationReviewGate: "manual-or-automated-visual-oracle-required",
		visualVerificationStatus: "unverified",
	} as unknown as CapCutGuiRegressionExecutionResult;
	const guiResultPath = join(evidenceDirectory, "gui-regression-result.json");
	await writeFile(
		guiResultPath,
		`${JSON.stringify(result, null, 2)}\n`,
		"utf8"
	);
	return {
		guiPlanPath,
		guiResultPath,
		lutMaskExpectedFixturePath: mediaFixtures.lutMask.expectedPath,
		lutMaskSourceFixturePath: mediaFixtures.lutMask.sourcePath,
	};
}

async function createVisualOracle({
	evidenceDirectory,
	forgedTextLutMask,
	lutMaskExpectedFixturePath,
	lutMaskSourceFixturePath,
	rootDirectory,
	runId,
	verifiedVisuals,
}: {
	evidenceDirectory: string;
	forgedTextLutMask: boolean;
	lutMaskExpectedFixturePath: string;
	lutMaskSourceFixturePath: string;
	rootDirectory: string;
	runId: string;
	verifiedVisuals: boolean;
}) {
	const capturesDirectory = join(evidenceDirectory, "visual-captures");
	const oracleDirectory = join(rootDirectory, "visual-oracle");
	const sourceDirectory = join(rootDirectory, "visual-source");
	await Promise.all([
		mkdir(capturesDirectory, { recursive: true }),
		mkdir(oracleDirectory),
		mkdir(sourceDirectory),
	]);
	const sourcePaths = {
		bundleManifest: join(sourceDirectory, "bundle-manifest.json"),
		fixtureManifest: join(sourceDirectory, "fixture-manifest.json"),
		frameA: join(sourceDirectory, "frame-a.png"),
		frameB: join(sourceDirectory, "frame-b.png"),
		sticker: join(sourceDirectory, "sticker.png"),
	};
	await Promise.all(
		Object.entries(sourcePaths).map(([id, path]) =>
			id === "frameA"
				? copyFile(lutMaskSourceFixturePath, path)
				: writeEvidenceFile({ path, value: `locked ${id}` })
		)
	);
	const sourceEvidenceEntries = await Promise.all(
		Object.entries(sourcePaths).map(
			async ([id, path]) => [id, await describeVisualFile({ path })] as const
		)
	);
	const source = Object.fromEntries(sourceEvidenceEntries) as Record<
		keyof typeof sourcePaths,
		VisualFileEvidence
	>;
	const framePlan = buildDissolveFramePlan({
		fps: 30,
		intervalEvidence: null,
		intervalReason: "No numbered export is available.",
		intervalSource: "expected-seam-candidate",
		intervalStatus: "unverified",
		transitionDurationMicroseconds: 466_666,
		transitionFrameCount: 14,
		transitionStartFrameIndex: 83,
	});
	const expectedDissolvePaths = framePlan.samples.map((sample) =>
		join(oracleDirectory, "dissolve", getDissolveFileName({ sample }))
	);
	const lutExpectedPath = join(oracleDirectory, "lut-mask", "expected.png");
	await Promise.all([
		...expectedDissolvePaths.map((path, index) =>
			writeEvidenceFile({ path, value: `expected dissolve ${index}` })
		),
		mkdir(dirname(lutExpectedPath), { recursive: true }).then(() =>
			copyFile(lutMaskExpectedFixturePath, lutExpectedPath)
		),
	]);
	const expectedDissolve = await Promise.all(
		expectedDissolvePaths.map((path) => describeVisualFile({ path }))
	);
	const dissolveCaptures = await Promise.all(
		framePlan.samples.map((sample) =>
			describeVisualFile({
				path: join(
					capturesDirectory,
					"dissolve",
					getDissolveFileName({ sample })
				),
			})
		)
	);
	const lutExpected = await describeVisualFile({ path: lutExpectedPath });
	const stickerPath = join(capturesDirectory, "sticker", "reopened-icon.png");
	const lutPath = join(capturesDirectory, "lut-mask", "reopened-lut-mask.png");
	if (verifiedVisuals) {
		await writeEvidenceFile({
			path: stickerPath,
			value: VERIFIED_STICKER_ASSET_CONTENT,
		});
		await mkdir(dirname(lutPath), { recursive: true });
		await copyFile(
			join(evidenceDirectory, "lut-mask", "reopen-lut-mask-reopen.png"),
			lutPath
		);
	}
	const stickerCapture = verifiedVisuals
		? {
				exists: true as const,
				...(await describeVisualFile({ path: stickerPath })),
			}
		: { exists: false as const, path: stickerPath };
	const lutCapture = verifiedVisuals
		? {
				exists: true as const,
				...(await describeVisualFile({ path: lutPath })),
			}
		: { exists: false as const, path: lutPath };
	const stickerComparison = verifiedVisuals
		? compareTransparentSticker({
				reopenedAssetGeometry: { height: 1, width: 1 },
				reopenedAssetPixels: Uint8Array.from([10, 20, 30, 255]),
				sourceGeometry: { height: 1, width: 1 },
				sourcePixels: Uint8Array.from([10, 20, 30, 255]),
			})
		: null;
	let lutComparison: VisualOracleManifest["lutMask"]["comparison"] = null;
	if (verifiedVisuals) {
		lutComparison = forgedTextLutMask
			? buildForgedLutMaskComparison()
			: await buildFixtureLutMaskComparison({
					capturePath: lutPath,
					expectedPath: lutExpectedPath,
					rootDirectory,
				});
	}
	const oracle: VisualOracleManifest = {
		capturesDirectory,
		createdAt: "2026-08-01T00:02:00.000Z",
		dissolve: {
			framePlan,
			mixSpace: "encoded-rgb-0-255-linear-weight",
			rmseThreshold: 8,
			samples: framePlan.samples.map((sample, index) => ({
				capture: {
					exists: true,
					...(dissolveCaptures[index] as VisualFileEvidence),
				},
				comparison: buildFixtureDissolveComparison(),
				expected: expectedDissolve[index] as VisualFileEvidence,
				frameOffset: sample.frameOffset,
				id: getDissolveSampleId({ nominalProgress: sample.nominalProgress }),
				nominalProgress: sample.nominalProgress,
				realizedProgress: sample.realizedProgress,
				status: "verified",
				timelineFrameIndex: sample.timelineFrameIndex,
				timelineFrameNumber: sample.timelineFrameNumber,
				transitionFrameNumber: sample.transitionFrameNumber,
			})),
			sourceFrameCalibration: {
				...CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration,
				evidence: {
					clipARoiSha256: "a".repeat(64),
					clipBRoiSha256: "b".repeat(64),
					ordinalStripSha256: ["c".repeat(64), "d".repeat(64)],
				},
				fixtureSchemaVersion: 2,
				reason: "Locked fixture calibration.",
				status: "verified",
			},
			status: "unverified",
		},
		lutMask: {
			capture: lutCapture,
			comparison: lutComparison,
			expected: lutExpected,
			status: verifiedVisuals ? "verified" : "unverified",
		},
		overallStatus: "unverified",
		runId,
		schemaVersion: 2,
		source: {
			bundleManifest: source.bundleManifest,
			fixtureManifest: source.fixtureManifest,
			frameA: source.frameA,
			frameB: source.frameB,
		},
		sticker: {
			comparison: stickerComparison,
			reopenedAsset: stickerCapture,
			source: source.sticker,
			status: verifiedVisuals ? "verified" : "unverified",
		},
		toolchain: {
			ffmpeg: { banner: "ffmpeg 8.1.2", path: "/ffmpeg", version: "8.1.2" },
			ffprobe: { banner: "ffprobe 8.1.2", path: "/ffprobe", version: "8.1.2" },
		},
	};
	oracle.overallStatus = deriveOverallVisualStatus({
		statuses: [
			oracle.dissolve.status,
			oracle.lutMask.status,
			oracle.sticker.status,
		],
	});
	const visualOracleManifestPath = join(oracleDirectory, "manifest.json");
	await writeFile(
		visualOracleManifestPath,
		`${JSON.stringify(oracle, null, 2)}\n`,
		"utf8"
	);
	return { oracle, visualOracleManifestPath };
}

export async function createGuiVisualBridgeFixture({
	forgedTextLutMask = false,
	verifiedVisuals = false,
}: {
	forgedTextLutMask?: boolean;
	verifiedVisuals?: boolean;
} = {}): Promise<GuiVisualBridgeFixture> {
	const canonicalTemporaryRoot = await realpath(tmpdir());
	const rootDirectory = await mkdtemp(
		join(canonicalTemporaryRoot, "qcut-gui-visual-")
	);
	temporaryDirectories.push(rootDirectory);
	const evidenceDirectory = join(rootDirectory, "gui-evidence");
	await mkdir(evidenceDirectory);
	const runId = "gui-visual-test";
	const bundleManifestPath = join(
		rootDirectory,
		"visual-source",
		"bundle-manifest.json"
	);
	const gui = await createGuiArtifacts({
		bundleManifestPath,
		evidenceDirectory,
		forgedTextLutMask,
		rootDirectory,
		runId,
		verifiedVisuals,
	});
	const extraction = await writeCapCutGuiVisualExtractionManifest({
		createdAt: "2026-08-01T00:01:30.000Z",
		guiPlanPath: gui.guiPlanPath,
		guiResultPath: gui.guiResultPath,
	});
	const visual = await createVisualOracle({
		evidenceDirectory,
		forgedTextLutMask,
		lutMaskExpectedFixturePath: gui.lutMaskExpectedFixturePath,
		lutMaskSourceFixturePath: gui.lutMaskSourceFixturePath,
		rootDirectory,
		runId,
		verifiedVisuals,
	});
	return {
		evidenceDirectory,
		extractionManifestPath: extraction.manifestPath,
		rootDirectory,
		...gui,
		...visual,
	};
}

export async function cleanupGuiVisualBridgeFixtures() {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((path) => rm(path, { force: true, recursive: true }))
	);
}
