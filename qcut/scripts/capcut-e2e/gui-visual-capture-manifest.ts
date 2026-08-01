import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { writeJsonEvidence } from "./gui-regression-evidence.js";
import {
	requireCanonicalPath,
	requireNonEmptyString,
	requireRecord,
} from "./gui-regression-filesystem.js";
import {
	findGuiCheckEvidence,
	findGuiExportEvidence,
	loadGuiVisualArtifacts,
} from "./gui-visual-gui-artifacts.js";
import {
	CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA,
	CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA_VERSION,
	type CapCutGuiVisualCaptureManifest,
} from "./gui-visual-evidence-contract.js";
import { loadCapCutGuiVisualExtractionManifest } from "./gui-visual-extraction.js";
import { recomputeBoundLutMaskComparison } from "./gui-visual-lut-mask-verification.js";
import { loadBoundGuiVisualOracle } from "./gui-visual-oracle-binding.js";
import { deriveVerificationStatus } from "./visual-contract.js";
import {
	describeVisualFile,
	readVisualJsonFileSnapshot,
} from "./visual-files.js";

const CAPTURE_MANIFEST_FILE_NAME = "gui-visual-capture-manifest.json";

function requireIsoTimestamp({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
	}
}

export async function buildCapCutGuiVisualCaptureManifest({
	createdAt = new Date().toISOString(),
	extractionManifestPath,
	guiPlanPath,
	guiResultPath,
	visualOracleManifestPath,
}: {
	createdAt?: string;
	extractionManifestPath: string;
	guiPlanPath: string;
	guiResultPath: string;
	visualOracleManifestPath: string;
}): Promise<CapCutGuiVisualCaptureManifest> {
	requireIsoTimestamp({
		label: "Capture manifest createdAt",
		value: createdAt,
	});
	const gui = await loadGuiVisualArtifacts({ guiPlanPath, guiResultPath });
	const extraction = await loadCapCutGuiVisualExtractionManifest({
		path: extractionManifestPath,
	});
	const { evidence, oracle } = await loadBoundGuiVisualOracle({
		bundleManifestPath: gui.plan.bundleRun.manifestPath,
		evidenceDirectory: gui.plan.evidenceDirectory,
		ownerUid: gui.ownerUid,
		runId: gui.plan.bundleRun.runId,
		visualOracleManifestPath,
	});
	if (
		extraction.manifest.runId !== gui.plan.bundleRun.runId ||
		extraction.manifest.capturesDirectory !== oracle.capturesDirectory ||
		!isDeepStrictEqual(extraction.manifest.guiPlan, gui.planEvidence) ||
		!isDeepStrictEqual(
			extraction.manifest.guiExecutionResult,
			gui.resultEvidence
		)
	) {
		throw new Error("GUI visual extraction is not bound to the capture run.");
	}
	const extractedDissolve = extraction.manifest.frames.filter(
		({ caseId }) => caseId === "dissolve"
	);
	if (
		extractedDissolve.length !== oracle.dissolve.samples.length ||
		oracle.dissolve.samples.some((sample, index) => {
			const extracted = extractedDissolve[index];
			return (
				!extracted ||
				!sample.capture.exists ||
				!isDeepStrictEqual(sample.capture, {
					exists: true,
					...extracted.output,
				})
			);
		})
	) {
		throw new Error(
			"Dissolve oracle captures are not exact GUI export extractions."
		);
	}
	const nativeExportFrame = extraction.manifest.frames.find(
		({ id }) => id === "native-elements-export-frame"
	)?.output;
	if (!nativeExportFrame) {
		throw new Error("Native export extraction evidence is missing.");
	}
	const firstOpenTitle = findGuiCheckEvidence({
		checkId: "native-title-cjk-visible",
		result: gui.result,
	});
	const firstOpenCaption = findGuiCheckEvidence({
		checkId: "native-caption-cjk-visible",
		result: gui.result,
	});
	const reopen = findGuiCheckEvidence({
		checkId: "transparent-sticker-reopen",
		result: gui.result,
	});
	const lutMaskReopen = findGuiCheckEvidence({
		checkId: "lut-mask-reopen",
		result: gui.result,
	});
	if (
		oracle.lutMask.capture.exists &&
		(oracle.lutMask.capture.bytes !== lutMaskReopen.bytes ||
			oracle.lutMask.capture.sha256 !== lutMaskReopen.sha256)
	) {
		throw new Error(
			"LUT/mask reopen oracle is not the GUI reopen capture evidence."
		);
	}
	if (oracle.lutMask.capture.exists) {
		const comparison = await recomputeBoundLutMaskComparison({
			capturePath: oracle.lutMask.capture.path,
			expectedPath: oracle.lutMask.expected.path,
			ffmpegPath: extraction.manifest.toolchain.ffmpeg.path,
			ffprobePath: extraction.manifest.toolchain.ffprobe.path,
			temporaryParentDirectory: gui.plan.evidenceDirectory,
		}).catch((error: unknown) => {
			throw new Error(
				"LUT/mask reopen oracle images could not be independently decoded and compared.",
				{ cause: error }
			);
		});
		const status = deriveVerificationStatus({
			pass: comparison.pass,
			present: true,
		});
		if (
			!isDeepStrictEqual(comparison, oracle.lutMask.comparison) ||
			status !== oracle.lutMask.status
		) {
			throw new Error(
				"LUT/mask reopen oracle comparison is not reproducible from the bound images."
			);
		}
	}
	if (oracle.sticker.reopenedAsset.exists) {
		const nativeFinal = gui.result.finalDraftVerifications.find(
			({ caseId }) => caseId === "native-text-sticker"
		);
		const stickerProofs = nativeFinal?.immutableAssetFiles.filter(
			({ relativePath }) => relativePath.split("/").at(-1) === "icon.png"
		);
		const stickerProof = stickerProofs?.[0];
		const semanticEvidence = nativeFinal?.semanticEvidence as
			| { sticker?: { materialName?: unknown } }
			| undefined;
		const currentStickerProof = stickerProof
			? await describeVisualFile({ path: stickerProof.path })
			: null;
		if (
			stickerProofs?.length !== 1 ||
			!stickerProof ||
			!currentStickerProof ||
			semanticEvidence?.sticker?.materialName !== "icon.png" ||
			!isDeepStrictEqual(currentStickerProof, {
				bytes: stickerProof.bytes,
				path: stickerProof.path,
				sha256: stickerProof.sha256,
			}) ||
			stickerProof.bytes !== oracle.sticker.reopenedAsset.bytes ||
			stickerProof.sha256 !== oracle.sticker.reopenedAsset.sha256
		) {
			throw new Error(
				"Sticker reopen oracle is not bound to the final immutable draft asset."
			);
		}
	}
	return {
		capturesDirectory: oracle.capturesDirectory,
		createdAt,
		evidenceDirectory: gui.plan.evidenceDirectory,
		exports: {
			dissolve: findGuiExportEvidence({
				caseId: "dissolve",
				result: gui.result,
			}),
			lutMask: findGuiExportEvidence({
				caseId: "lut-mask",
				result: gui.result,
			}),
			nativeTextSticker: findGuiExportEvidence({
				caseId: "native-text-sticker",
				result: gui.result,
			}),
		},
		extractionManifest: extraction.evidence,
		guiExecutionResult: gui.resultEvidence,
		guiPlan: gui.planEvidence,
		nativeText: {
			caption: {
				export: nativeExportFrame,
				"first-open": firstOpenCaption,
				reopen,
			},
			title: {
				export: nativeExportFrame,
				"first-open": firstOpenTitle,
				reopen,
			},
		},
		oracleCaptures: {
			dissolve: oracle.dissolve.samples.map(({ capture, id }) => ({
				capture,
				id,
			})),
			lutMask: oracle.lutMask.capture,
			sticker: oracle.sticker.reopenedAsset,
		},
		ownerUid: gui.ownerUid,
		runId: gui.plan.bundleRun.runId,
		schema: CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA,
		schemaVersion: CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA_VERSION,
		visualOracle: evidence,
	};
}

export async function writeCapCutGuiVisualCaptureManifest({
	createdAt,
	extractionManifestPath,
	guiPlanPath,
	guiResultPath,
	visualOracleManifestPath,
}: {
	createdAt?: string;
	extractionManifestPath: string;
	guiPlanPath: string;
	guiResultPath: string;
	visualOracleManifestPath: string;
}): Promise<{
	manifest: CapCutGuiVisualCaptureManifest;
	manifestPath: string;
}> {
	const manifest = await buildCapCutGuiVisualCaptureManifest({
		createdAt,
		extractionManifestPath,
		guiPlanPath,
		guiResultPath,
		visualOracleManifestPath,
	});
	const manifestPath = join(
		manifest.evidenceDirectory,
		CAPTURE_MANIFEST_FILE_NAME
	);
	await writeJsonEvidence({ path: manifestPath, value: manifest });
	const loaded = await loadCapCutGuiVisualCaptureManifest({
		path: manifestPath,
	});
	return { manifest: loaded.manifest, manifestPath };
}

export async function loadCapCutGuiVisualCaptureManifest({
	path,
}: {
	path: string;
}) {
	const canonical = await requireCanonicalPath({
		expectedKind: "file",
		label: "GUI visual capture manifest",
		path,
	});
	const snapshot = await readVisualJsonFileSnapshot({
		label: "GUI visual capture manifest",
		path,
	});
	const record = requireRecord({
		label: "GUI visual capture manifest",
		value: snapshot.value,
	});
	if (
		record.schema !== CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA ||
		record.schemaVersion !== CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA_VERSION
	) {
		throw new Error("GUI visual capture manifest schema is unsupported.");
	}
	const manifest = record as unknown as CapCutGuiVisualCaptureManifest;
	const evidenceDirectory = requireNonEmptyString({
		label: "GUI visual capture evidence directory",
		value: manifest.evidenceDirectory,
	});
	if (
		path !== join(evidenceDirectory, CAPTURE_MANIFEST_FILE_NAME) ||
		canonical.stats.uid !== BigInt(manifest.ownerUid)
	) {
		throw new Error(
			"GUI visual capture manifest path or owner is inconsistent."
		);
	}
	const rebuilt = await buildCapCutGuiVisualCaptureManifest({
		createdAt: manifest.createdAt,
		extractionManifestPath: manifest.extractionManifest.path,
		guiPlanPath: manifest.guiPlan.path,
		guiResultPath: manifest.guiExecutionResult.path,
		visualOracleManifestPath: manifest.visualOracle.path,
	});
	if (!isDeepStrictEqual(manifest, rebuilt)) {
		throw new Error("GUI visual capture manifest is not reproducible.");
	}
	return { evidence: snapshot.evidence, manifest };
}
