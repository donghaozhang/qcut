import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	AUDIO_COMPARISON_MANIFEST_SCHEMA,
	CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
} from "../capcut-e2e/audio-comparison-contract.js";
import type { AudioComparisonManifest } from "../capcut-e2e/audio-comparison.js";
import {
	CAPCUT_8_1_NATIVE_FRAME_THRESHOLDS,
	FRAME_COMPARISON_MANIFEST_SCHEMA,
	type FrameComparisonManifest,
} from "../capcut-e2e/frame-comparison.js";
import type { FrameSamplePlan } from "../capcut-e2e/frame-sample-plan.js";
import {
	CAPCUT_8_1_PREVIEW_FRAME_THRESHOLDS,
	PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA,
	type PreviewFrameComparisonManifest,
} from "../capcut-e2e/preview-frame-comparison.js";
import {
	QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
	type QCutImportVerificationManifest,
} from "../capcut-e2e/qcut-import-verification-contract.js";
import {
	parseRoundtripCaseCliOptions,
	ROUNDTRIP_CASE_MANIFEST_FILE_NAME,
	runRoundtripCase,
	type RoundtripCaseDependencies,
} from "../capcut-e2e/roundtrip-case.js";
import {
	SEMANTIC_DIFF_MANIFEST_SCHEMA,
	type DiffableDocument,
	type EditorCoreApi,
	type ImportPipelineApi,
	type SemanticDiffCaseManifest,
} from "../capcut-e2e/semantic-diff.js";

const NOW = "2026-08-05T00:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const TOOLCHAIN = {
	ffmpeg: { banner: "ffmpeg version 8.1.2", version: "8.1.2" },
	ffprobe: { banner: "ffprobe version 8.1.2", version: "8.1.2" },
	targetKey: "darwin-arm64",
};

let rootDirectory: string;

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-roundtrip-case-test-"));
});

afterEach(async () => {
	await rm(rootDirectory, { force: true, recursive: true });
});

function document(): DiffableDocument {
	return {
		project: { durationUs: 1_000_000, fps: 1 },
		timelines: [
			{
				isRoot: true,
				tracks: [
					{
						segments: [
							{
								id: "clip",
								kind: "video",
								targetRange: { durationUs: 1_000_000, startUs: 0 },
							},
						],
					},
				],
			},
		],
	};
}

function samplePlan(): FrameSamplePlan {
	return {
		coverage: {
			keyframes: "unsupported-by-interop-v1",
			transitionInterval: "semantic-seam-candidate",
		},
		durationUs: 1_000_000,
		fps: 1,
		frameCount: 1,
		randomSampleCount: 0,
		requestedRandomSampleCount: 0,
		samples: [
			{
				frameIndex: 0,
				reasons: [{ kind: "project-first" }],
				timestampUs: 0,
			},
		],
		seed: 1,
	};
}

function semanticManifest(): SemanticDiffCaseManifest {
	return {
		generatedAtIso: NOW,
		left: {
			files: [
				{ byteLength: 1, relativePath: "draft_info.json", sha256: SHA_A },
			],
			outcome: "exact",
			profileId: "capcut-desktop-8.1-plaintext",
		},
		options: { speedTolerance: 0, timeToleranceUs: 500_000 },
		right: {
			files: [
				{ byteLength: 1, relativePath: "draft_info.json", sha256: SHA_B },
			],
			outcome: "exact",
			profileId: "capcut-desktop-8.1-plaintext",
		},
		schema: SEMANTIC_DIFF_MANIFEST_SCHEMA,
		schemaVersion: 1,
		verdict: "identical",
	};
}

function audioManifest(): AudioComparisonManifest {
	return {
		generatedAtIso: NOW,
		left: { bytes: 100, sha256: SHA_A },
		right: { bytes: 100, sha256: SHA_B },
		schema: AUDIO_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds: CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
		toolchain: TOOLCHAIN,
		verdict: "pass",
	};
}

function nativeManifest(): FrameComparisonManifest {
	return {
		checks: {
			fpsMatch: true,
			frameCountMatch: true,
			geometryMatch: true,
			planCoverage: true,
		},
		generatedAtIso: NOW,
		left: { bytes: 100, sha256: SHA_A },
		right: { bytes: 100, sha256: SHA_B },
		samples: [],
		schema: FRAME_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds: CAPCUT_8_1_NATIVE_FRAME_THRESHOLDS,
		toolchain: TOOLCHAIN,
		verdict: "pass",
	};
}

function previewManifest(): PreviewFrameComparisonManifest {
	return {
		checks: {
			comparedSampleCountMatch: true,
			leftPlanCoverage: true,
			rightPlanCoverage: true,
		},
		generatedAtIso: NOW,
		left: { availableSampleCount: 1, sampleSetSha256: SHA_A },
		missing: [],
		right: { availableSampleCount: 1, sampleSetSha256: SHA_B },
		samplePlan: {
			coverage: samplePlan().coverage,
			durationUs: 1_000_000,
			fps: 1,
			frameCount: 1,
			sampleCount: 1,
			seed: 1,
			sha256: SHA_A,
		},
		samples: [],
		schema: PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds: CAPCUT_8_1_PREVIEW_FRAME_THRESHOLDS,
		toolchain: TOOLCHAIN,
		verdict: "pass",
	};
}

function qcutImportManifest(): QCutImportVerificationManifest {
	return {
		bundle: { byteLength: 100, bundleDigest: SHA_A, sha256: SHA_A },
		checks: {
			bundleDigest: true,
			captureTrusted: true,
			importId: true,
			profileId: true,
			projectFps: true,
			projectGeometry: true,
			projectName: true,
		},
		capture: { source: "qcut-renderer-persisted-storage" },
		generatedAtIso: NOW,
		qcutSnapshot: { byteLength: 100, sha256: SHA_B },
		roles: {
			actual: "qcut-renderer-snapshot",
			expected: "import-bundle",
		},
		schema: QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
		schemaVersion: 2,
		verdict: "pass",
	};
}

interface ComparisonCalls {
	audio?: { leftPath: string; rightPath: string };
	native?: { leftPath: string; rightPath: string };
	preview?: { leftDirectory: string; rightDirectory: string };
	qcutImport?: { bundlePath: string; qcutSnapshotPath: string };
}

function dependencies({
	calls,
	sourceDocument = document(),
}: {
	calls: ComparisonCalls;
	sourceDocument?: DiffableDocument | null;
}): RoundtripCaseDependencies {
	const api = {} as ImportPipelineApi & EditorCoreApi;
	return {
		buildFrameSamplePlan: ({ document: _document }) => samplePlan(),
		buildSemanticDiffCaseManifest: ({
			api: _api,
			left: _left,
			nowIso: _nowIso,
			right: _right,
		}) => semanticManifest(),
		compareAudioOutputs: async ({ leftPath, rightPath }) => {
			calls.audio = { leftPath, rightPath };
			return audioManifest();
		},
		comparePreviewFrameDirectories: async ({
			leftDirectory,
			rightDirectory,
		}) => {
			calls.preview = { leftDirectory, rightDirectory };
			return previewManifest();
		},
		compareVideoFrames: async ({ leftPath, rightPath }) => {
			calls.native = { leftPath, rightPath };
			return nativeManifest();
		},
		loadSemanticDiffApi: async () => api,
		normalizeDraftForSemanticDiff: async ({ draftDirectory }) => {
			const normalizedDocument = draftDirectory.includes("source")
				? sourceDocument
				: document();
			return {
				...(normalizedDocument ? { document: normalizedDocument } : {}),
				evidence: { files: [], outcome: "exact" },
			};
		},
		runQCutImportVerification: async ({ bundlePath, qcutSnapshotPath }) => {
			calls.qcutImport = { bundlePath, qcutSnapshotPath };
			return qcutImportManifest();
		},
	};
}

function runOptions({
	calls,
	outputDirectory,
	sourceDocument,
}: {
	calls: ComparisonCalls;
	outputDirectory?: string;
	sourceDocument?: DiffableDocument | null;
}) {
	return {
		caseId: "capcut-8.1-core",
		dependencies: dependencies({ calls, sourceDocument }),
		nowIso: NOW,
		...(outputDirectory ? { outputDirectory } : {}),
		qcutImportBundlePath: join(rootDirectory, "qcut-import-bundle.json"),
		qcutImportSnapshotPath: join(rootDirectory, "qcut-import-snapshot.json"),
		qcutNativeExportPath: join(rootDirectory, "qcut.mov"),
		qcutPreviewDirectory: join(rootDirectory, "qcut-preview"),
		referenceNativeExportPath: join(rootDirectory, "reference.mov"),
		referencePreviewDirectory: join(rootDirectory, "reference-preview"),
		roundtripDraftDirectory: join(rootDirectory, "roundtrip-draft"),
		sourceDraftDirectory: join(rootDirectory, "source-draft"),
	};
}

describe("runRoundtripCase", () => {
	it("orchestrates import and all four outputs with path-free evidence", async () => {
		const calls: ComparisonCalls = {};
		const outputDirectory = join(rootDirectory, "evidence");
		await mkdir(outputDirectory);
		const options = runOptions({ calls, outputDirectory });
		const manifest = await runRoundtripCase(options);

		expect(manifest.verdict).toBe("unverified");
		expect(manifest.schemaVersion).toBe(2);
		expect(manifest.roles).toEqual({
			audio: { left: "reference", right: "qcut" },
			nativeFrames: { left: "reference", right: "qcut" },
			previewFrames: { left: "reference", right: "qcut" },
			qcutImport: {
				actual: "qcut-renderer-snapshot",
				expected: "import-bundle",
			},
			semantic: { left: "source-draft", right: "roundtrip-draft" },
		});
		expect(calls).toEqual({
			audio: {
				leftPath: options.referenceNativeExportPath,
				rightPath: options.qcutNativeExportPath,
			},
			native: {
				leftPath: options.referenceNativeExportPath,
				rightPath: options.qcutNativeExportPath,
			},
			preview: {
				leftDirectory: options.referencePreviewDirectory,
				rightDirectory: options.qcutPreviewDirectory,
			},
			qcutImport: {
				bundlePath: options.qcutImportBundlePath,
				qcutSnapshotPath: options.qcutImportSnapshotPath,
			},
		});
		const written = await readFile(
			join(outputDirectory, ROUNDTRIP_CASE_MANIFEST_FILE_NAME),
			"utf8"
		);
		expect(written).not.toContain(rootDirectory);
		expect(JSON.parse(written)).toEqual(JSON.parse(JSON.stringify(manifest)));
	});

	it("does not run visual comparisons without a normalized source document", async () => {
		const calls: ComparisonCalls = {};
		const manifest = await runRoundtripCase(
			runOptions({ calls, sourceDocument: null })
		);

		expect(manifest.verdict).toBe("not-comparable");
		expect(manifest.samplePlan).toBeUndefined();
		expect(calls).toEqual({
			audio: {
				leftPath: join(rootDirectory, "reference.mov"),
				rightPath: join(rootDirectory, "qcut.mov"),
			},
			qcutImport: {
				bundlePath: join(rootDirectory, "qcut-import-bundle.json"),
				qcutSnapshotPath: join(rootDirectory, "qcut-import-snapshot.json"),
			},
		});
	});
});

describe("parseRoundtripCaseCliOptions", () => {
	it("parses the complete import and four-output command", () => {
		expect(
			parseRoundtripCaseCliOptions({
				argv: [
					"--json",
					"--case-id",
					"case-1",
					"--source-draft",
					"/draft/source",
					"--roundtrip-draft",
					"/draft/roundtrip",
					"--qcut-import-bundle",
					"/import/bundle.json",
					"--qcut-import-snapshot",
					"/import/qcut-snapshot.json",
					"--qcut-native-export",
					"/export/qcut.mov",
					"--reference-native-export",
					"/export/reference.mov",
					"--qcut-preview-frames",
					"/preview/qcut",
					"--reference-preview-frames",
					"/preview/reference",
					"--output",
					"/evidence",
				],
			})
		).toEqual({
			caseId: "case-1",
			json: true,
			outputDirectory: "/evidence",
			qcutImportBundlePath: "/import/bundle.json",
			qcutImportSnapshotPath: "/import/qcut-snapshot.json",
			qcutNativeExportPath: "/export/qcut.mov",
			qcutPreviewDirectory: "/preview/qcut",
			referenceNativeExportPath: "/export/reference.mov",
			referencePreviewDirectory: "/preview/reference",
			roundtripDraftDirectory: "/draft/roundtrip",
			sourceDraftDirectory: "/draft/source",
		});
	});

	it("rejects missing, duplicate, and unknown flags", () => {
		expect(() =>
			parseRoundtripCaseCliOptions({ argv: ["--case-id", "case"] })
		).toThrow("Missing required flag: --source-draft");
		expect(() =>
			parseRoundtripCaseCliOptions({
				argv: ["--case-id", "first", "--case-id", "second"],
			})
		).toThrow("Duplicate flag: --case-id");
		expect(() => parseRoundtripCaseCliOptions({ argv: ["--wat"] })).toThrow(
			"Unknown flag: --wat"
		);
	});
});
