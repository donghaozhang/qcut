import { isDeepStrictEqual } from "node:util";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildFrameExtractionArgs } from "./ffmpeg-args.js";
import {
	requireGuiEvidenceFiles,
	writeJsonEvidence,
} from "./gui-regression-evidence.js";
import {
	requireCanonicalPath,
	requireRecord,
} from "./gui-regression-filesystem.js";
import {
	findGuiExportEvidence,
	loadGuiVisualArtifacts,
} from "./gui-visual-gui-artifacts.js";
import {
	buildCapCutGuiVisualExtractionFrames,
	type CapCutGuiVisualExportEvidence,
} from "./gui-visual-extraction-contract.js";
import {
	CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA,
	CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA_VERSION,
	type CapCutGuiVisualExportProbe,
	type CapCutGuiVisualExtractionFrame,
	type CapCutGuiVisualExtractionManifest,
} from "./gui-visual-evidence-contract.js";
import { probeGuiVisualExport } from "./gui-visual-export-probe.js";
import {
	resolveGuiVisualFfmpeg,
	resolveGuiVisualFfprobe,
	runGuiVisualFfmpeg,
} from "./gui-visual-ffmpeg.js";
import type { VisualFileEvidence } from "./visual-contract.js";
import {
	describeVisualFile,
	readVisualJsonFileSnapshot,
} from "./visual-files.js";

const PROJECT_ROOT = resolve(process.cwd());
const EXTRACTION_MANIFEST_FILE_NAME = "gui-visual-extraction-manifest.json";

function normalizeFileEvidence({
	bytes,
	path,
	sha256,
}: VisualFileEvidence): VisualFileEvidence {
	return { bytes, path, sha256 };
}

function requireIsoTimestamp({ value }: { value: string }) {
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error(
			"GUI visual extraction createdAt is not canonical ISO-8601."
		);
	}
}

function getExports({
	result,
}: {
	result: Awaited<ReturnType<typeof loadGuiVisualArtifacts>>["result"];
}): CapCutGuiVisualExportEvidence {
	return {
		dissolve: findGuiExportEvidence({ caseId: "dissolve", result }),
		lutMask: findGuiExportEvidence({ caseId: "lut-mask", result }),
		nativeTextSticker: findGuiExportEvidence({
			caseId: "native-text-sticker",
			result,
		}),
	};
}

async function resolveTools() {
	const [ffmpeg, ffprobe] = await Promise.all([
		resolveGuiVisualFfmpeg({ projectRoot: PROJECT_ROOT }),
		resolveGuiVisualFfprobe({ projectRoot: PROJECT_ROOT }),
	]);
	return { ffmpeg, ffprobe };
}

async function probeExports({
	exports,
	ffprobePath,
}: {
	exports: CapCutGuiVisualExportEvidence;
	ffprobePath: string;
}): Promise<CapCutGuiVisualExportProbe[]> {
	return Promise.all([
		probeGuiVisualExport({
			caseId: "native-text-sticker",
			ffprobePath,
			sourceExport: exports.nativeTextSticker,
		}),
		probeGuiVisualExport({
			caseId: "dissolve",
			ffprobePath,
			sourceExport: exports.dissolve,
		}),
		probeGuiVisualExport({
			caseId: "lut-mask",
			ffprobePath,
			sourceExport: exports.lutMask,
		}),
	]);
}

function requireProbeFrameCoverage({
	frames,
	probes,
}: {
	frames: readonly {
		caseId: CapCutGuiVisualExtractionFrame["caseId"];
		zeroBasedFrameIndex: number;
	}[];
	probes: readonly CapCutGuiVisualExportProbe[];
}) {
	for (const frame of frames) {
		const probe = probes.find(({ caseId }) => caseId === frame.caseId);
		if (!probe || frame.zeroBasedFrameIndex >= probe.frameCount) {
			throw new Error(
				`GUI export ${frame.caseId} does not contain extraction frame ${frame.zeroBasedFrameIndex}.`
			);
		}
	}
}

async function extractFrames({
	ffmpegPath,
	frames,
}: {
	ffmpegPath: string;
	frames: ReturnType<typeof buildCapCutGuiVisualExtractionFrames>;
}) {
	await Promise.all(
		frames.map(({ outputPath }) =>
			mkdir(dirname(outputPath), { recursive: true })
		)
	);
	await Promise.all(
		frames.map(({ outputPath, sourceExport, zeroBasedFrameIndex }) =>
			runGuiVisualFfmpeg({
				args: buildFrameExtractionArgs({
					frameIndex: zeroBasedFrameIndex,
					inputPath: sourceExport.path,
					outputPath,
				}),
				ffmpegPath,
			})
		)
	);
	return Promise.all(
		frames.map(async (frame): Promise<CapCutGuiVisualExtractionFrame> => {
			const { outputPath, ...contract } = frame;
			return {
				...contract,
				output: await describeVisualFile({ path: outputPath }),
			};
		})
	);
}

export async function writeCapCutGuiVisualExtractionManifest({
	createdAt = new Date().toISOString(),
	guiPlanPath,
	guiResultPath,
}: {
	createdAt?: string;
	guiPlanPath: string;
	guiResultPath: string;
}) {
	requireIsoTimestamp({ value: createdAt });
	const gui = await loadGuiVisualArtifacts({ guiPlanPath, guiResultPath });
	const capturesDirectory = join(gui.plan.evidenceDirectory, "visual-captures");
	await mkdir(capturesDirectory, { mode: 0o700 });
	const exports = getExports({ result: gui.result });
	const extractionFrames = buildCapCutGuiVisualExtractionFrames({
		capturesDirectory,
		exports,
	});
	const tools = await resolveTools();
	const exportProbes = await probeExports({
		exports,
		ffprobePath: tools.ffprobe.path,
	});
	requireProbeFrameCoverage({ frames: extractionFrames, probes: exportProbes });
	const frames = await extractFrames({
		ffmpegPath: tools.ffmpeg.path,
		frames: extractionFrames,
	});
	await requireGuiEvidenceFiles({
		evidencePaths: frames.map(({ output }) => output.path),
		ownerUid: gui.ownerUid,
	});
	const manifest: CapCutGuiVisualExtractionManifest = {
		capturesDirectory,
		createdAt,
		exportProbes,
		frames,
		guiExecutionResult: gui.resultEvidence,
		guiPlan: gui.planEvidence,
		ownerUid: gui.ownerUid,
		runId: gui.plan.bundleRun.runId,
		schema: CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA,
		schemaVersion: CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA_VERSION,
		toolchain: {
			ffmpeg: tools.ffmpeg.report,
			ffprobe: tools.ffprobe.report,
		},
	};
	const manifestPath = join(
		gui.plan.evidenceDirectory,
		EXTRACTION_MANIFEST_FILE_NAME
	);
	await writeJsonEvidence({ path: manifestPath, value: manifest });
	const loaded = await loadCapCutGuiVisualExtractionManifest({
		path: manifestPath,
	});
	return { manifest: loaded.manifest, manifestPath };
}

function requireExtractionManifest({ value }: { value: unknown }) {
	const record = requireRecord({
		label: "GUI visual extraction manifest",
		value,
	});
	if (
		record.schema !== CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA ||
		record.schemaVersion !== CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA_VERSION
	) {
		throw new Error("GUI visual extraction manifest schema is unsupported.");
	}
	return record as unknown as CapCutGuiVisualExtractionManifest;
}

function assertFrameContract({
	actual,
	expected,
}: {
	actual: CapCutGuiVisualExtractionFrame;
	expected: ReturnType<typeof buildCapCutGuiVisualExtractionFrames>[number];
}) {
	const { output, ...actualContract } = actual;
	const { outputPath, ...expectedContract } = expected;
	if (
		output.path !== outputPath ||
		!isDeepStrictEqual(actualContract, expectedContract)
	) {
		throw new Error(
			`GUI visual extraction frame ${expected.id} is inconsistent.`
		);
	}
}

async function reextractAndVerify({
	evidenceDirectory,
	ffmpegPath,
	frames,
}: {
	evidenceDirectory: string;
	ffmpegPath: string;
	frames: readonly CapCutGuiVisualExtractionFrame[];
}) {
	const temporaryDirectory = await mkdtemp(
		join(evidenceDirectory, ".gui-visual-reextract-")
	);
	try {
		const reextracted = await Promise.all(
			frames.map(async (frame, index) => {
				const outputPath = join(
					temporaryDirectory,
					`${index.toString().padStart(2, "0")}-${frame.id}.png`
				);
				await runGuiVisualFfmpeg({
					args: buildFrameExtractionArgs({
						frameIndex: frame.zeroBasedFrameIndex,
						inputPath: frame.sourceExport.path,
						outputPath,
					}),
					ffmpegPath,
				});
				return describeVisualFile({ path: outputPath });
			})
		);
		for (const [index, current] of reextracted.entries()) {
			const expected = frames[index]?.output;
			if (
				!expected ||
				current.bytes !== expected.bytes ||
				current.sha256 !== expected.sha256
			) {
				throw new Error(
					`GUI visual extraction ${index} failed exact re-extraction.`
				);
			}
		}
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}

export async function loadCapCutGuiVisualExtractionManifest({
	path,
}: {
	path: string;
}) {
	const canonical = await requireCanonicalPath({
		expectedKind: "file",
		label: "GUI visual extraction manifest",
		path,
	});
	const snapshot = await readVisualJsonFileSnapshot({
		label: "GUI visual extraction manifest",
		path,
	});
	const manifest = requireExtractionManifest({ value: snapshot.value });
	requireIsoTimestamp({ value: manifest.createdAt });
	const gui = await loadGuiVisualArtifacts({
		guiPlanPath: manifest.guiPlan.path,
		guiResultPath: manifest.guiExecutionResult.path,
	});
	if (
		path !== join(gui.plan.evidenceDirectory, EXTRACTION_MANIFEST_FILE_NAME) ||
		canonical.stats.uid !== BigInt(gui.ownerUid) ||
		manifest.ownerUid !== gui.ownerUid ||
		manifest.runId !== gui.plan.bundleRun.runId ||
		!isDeepStrictEqual(manifest.guiPlan, gui.planEvidence) ||
		!isDeepStrictEqual(manifest.guiExecutionResult, gui.resultEvidence)
	) {
		throw new Error("GUI visual extraction is not bound to the GUI result.");
	}
	const capturesDirectory = join(gui.plan.evidenceDirectory, "visual-captures");
	if (manifest.capturesDirectory !== capturesDirectory) {
		throw new Error("GUI visual extraction capture directory is inconsistent.");
	}
	await requireCanonicalPath({
		expectedKind: "directory",
		label: "GUI visual captures directory",
		path: capturesDirectory,
	});
	const tools = await resolveTools();
	if (
		!isDeepStrictEqual(manifest.toolchain, {
			ffmpeg: tools.ffmpeg.report,
			ffprobe: tools.ffprobe.report,
		})
	) {
		throw new Error("GUI visual extraction toolchain 8.1.2 binding changed.");
	}
	const exports = getExports({ result: gui.result });
	const currentProbes = await probeExports({
		exports,
		ffprobePath: tools.ffprobe.path,
	});
	if (!isDeepStrictEqual(manifest.exportProbes, currentProbes)) {
		throw new Error("GUI visual extraction export CFR probes changed.");
	}
	const expectedFrames = buildCapCutGuiVisualExtractionFrames({
		capturesDirectory,
		exports,
	});
	requireProbeFrameCoverage({
		frames: expectedFrames,
		probes: manifest.exportProbes,
	});
	if (manifest.frames.length !== expectedFrames.length) {
		throw new Error("GUI visual extraction frame set is incomplete.");
	}
	for (const [index, frame] of manifest.frames.entries()) {
		const expected = expectedFrames[index];
		if (!expected)
			throw new Error(`Missing extraction frame contract ${index}.`);
		assertFrameContract({ actual: frame, expected });
	}
	const currentRecords = await requireGuiEvidenceFiles({
		evidencePaths: manifest.frames.map(({ output }) => output.path),
		ownerUid: gui.ownerUid,
	});
	const currentEvidence = currentRecords.map(normalizeFileEvidence);
	if (
		!isDeepStrictEqual(
			currentEvidence,
			manifest.frames.map(({ output }) => output)
		)
	) {
		throw new Error("GUI visual extracted frames changed after extraction.");
	}
	await reextractAndVerify({
		evidenceDirectory: gui.plan.evidenceDirectory,
		ffmpegPath: tools.ffmpeg.path,
		frames: manifest.frames,
	});
	const afterRecords = await requireGuiEvidenceFiles({
		evidencePaths: manifest.frames.map(({ output }) => output.path),
		ownerUid: gui.ownerUid,
	});
	if (!isDeepStrictEqual(afterRecords, currentRecords)) {
		throw new Error("GUI visual extracted frames changed during verification.");
	}
	return { evidence: snapshot.evidence, manifest };
}
