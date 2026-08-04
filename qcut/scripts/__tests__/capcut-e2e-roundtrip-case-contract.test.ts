import { describe, expect, it } from "vitest";
import {
	AUDIO_COMPARISON_MANIFEST_SCHEMA,
	CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
} from "../capcut-e2e/audio-comparison-contract.js";
import type { AudioComparisonManifest } from "../capcut-e2e/audio-comparison.js";
import {
	FRAME_COMPARISON_MANIFEST_SCHEMA,
	type FrameComparisonManifest,
} from "../capcut-e2e/frame-comparison.js";
import type { FrameSamplePlan } from "../capcut-e2e/frame-sample-plan.js";
import {
	PREVIEW_FRAME_COMPARISON_MANIFEST_SCHEMA,
	type PreviewFrameComparisonManifest,
} from "../capcut-e2e/preview-frame-comparison.js";
import {
	QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
	type QCutImportVerificationManifest,
} from "../capcut-e2e/qcut-import-verification-contract.js";
import {
	assessRoundtripCase,
	type RoundtripCaseEvidence,
} from "../capcut-e2e/roundtrip-case-contract.js";
import {
	SEMANTIC_DIFF_MANIFEST_SCHEMA,
	type SemanticDiffCaseManifest,
} from "../capcut-e2e/semantic-diff.js";

const GENERATED_AT = "2026-08-05T00:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const TOOLCHAIN = {
	ffmpeg: { banner: "ffmpeg version 8.1.2", version: "8.1.2" },
	ffprobe: { banner: "ffprobe version 8.1.2", version: "8.1.2" },
	targetKey: "darwin-arm64",
};

function samplePlan({
	verified = false,
}: {
	verified?: boolean;
} = {}): FrameSamplePlan {
	return {
		coverage: {
			keyframes: verified ? "verified" : "unsupported-by-interop-v1",
			transitionInterval: verified ? "verified" : "semantic-seam-candidate",
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

function semantic({
	verdict = "identical",
}: {
	verdict?: SemanticDiffCaseManifest["verdict"];
} = {}): SemanticDiffCaseManifest {
	return {
		generatedAtIso: GENERATED_AT,
		left: { files: [], outcome: "exact", profileId: "capcut-8.1" },
		options: { speedTolerance: 0, timeToleranceUs: 16_667 },
		right: { files: [], outcome: "exact", profileId: "capcut-8.1" },
		schema: SEMANTIC_DIFF_MANIFEST_SCHEMA,
		schemaVersion: 1,
		verdict,
	};
}

function nativeFrames({
	evidenceStatus = "candidate-unverified",
	verdict = "pass",
}: {
	evidenceStatus?: "candidate-unverified" | "verified";
	verdict?: FrameComparisonManifest["verdict"];
} = {}): FrameComparisonManifest {
	return {
		checks: {
			fpsMatch: true,
			frameCountMatch: true,
			geometryMatch: true,
			planCoverage: true,
		},
		generatedAtIso: GENERATED_AT,
		left: { bytes: 100, sha256: SHA_A },
		right: { bytes: 100, sha256: SHA_B },
		samples: [],
		schema: FRAME_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds: {
			evidenceStatus,
			id: "native-thresholds",
			rmse: 8,
		},
		toolchain: TOOLCHAIN,
		verdict,
	};
}

function previewFrames({
	evidenceStatus = "candidate-unverified",
	verdict = "pass",
}: {
	evidenceStatus?: "candidate-unverified" | "verified";
	verdict?: PreviewFrameComparisonManifest["verdict"];
} = {}): PreviewFrameComparisonManifest {
	return {
		checks: {
			comparedSampleCountMatch: true,
			leftPlanCoverage: true,
			rightPlanCoverage: true,
		},
		generatedAtIso: GENERATED_AT,
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
		thresholds: {
			evidenceStatus,
			id: "preview-thresholds",
			rmse: 8,
		},
		toolchain: TOOLCHAIN,
		verdict,
	};
}

function audio({
	evidenceStatus = "candidate-unverified",
	verdict = "pass",
}: {
	evidenceStatus?: "candidate-unverified" | "verified";
	verdict?: AudioComparisonManifest["verdict"];
} = {}): AudioComparisonManifest {
	return {
		generatedAtIso: GENERATED_AT,
		left: { bytes: 100, sha256: SHA_A },
		right: { bytes: 100, sha256: SHA_B },
		schema: AUDIO_COMPARISON_MANIFEST_SCHEMA,
		schemaVersion: 1,
		thresholds: {
			...CAPCUT_8_1_CORE_AUDIO_THRESHOLDS,
			evidenceStatus,
		},
		toolchain: TOOLCHAIN,
		verdict,
	};
}

function qcutImport({
	verdict = "pass",
}: {
	verdict?: QCutImportVerificationManifest["verdict"];
} = {}): QCutImportVerificationManifest {
	return {
		bundle: { byteLength: 100, bundleDigest: SHA_A, sha256: SHA_A },
		checks: {
			bundleDigest: verdict === "pass",
			projectFps: verdict === "pass",
			projectGeometry: verdict === "pass",
			projectName: verdict === "pass",
		},
		generatedAtIso: GENERATED_AT,
		qcutSnapshot: { byteLength: 100, sha256: SHA_B },
		roles: {
			actual: "qcut-renderer-snapshot",
			expected: "import-bundle",
		},
		schema: QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
		schemaVersion: 1,
		verdict,
	};
}

function evidence({
	audioManifest = audio(),
	nativeManifest = nativeFrames(),
	previewManifest = previewFrames(),
	qcutImportManifest = qcutImport(),
	semanticManifest = semantic(),
}: {
	audioManifest?: AudioComparisonManifest;
	nativeManifest?: FrameComparisonManifest;
	previewManifest?: PreviewFrameComparisonManifest;
	qcutImportManifest?: QCutImportVerificationManifest;
	semanticManifest?: SemanticDiffCaseManifest;
} = {}): RoundtripCaseEvidence {
	return {
		audio: audioManifest,
		nativeFrames: nativeManifest,
		previewFrames: previewManifest,
		qcutImport: qcutImportManifest,
		semantic: semanticManifest,
	};
}

describe("CapCut E2E round-trip evidence gates", () => {
	it("keeps passing candidate evidence unverified", () => {
		const assessment = assessRoundtripCase({
			evidence: evidence(),
			provenance: {
				evidenceStatus: "candidate-unverified",
				id: "local-candidate",
			},
			samplePlan: samplePlan(),
		});

		expect(assessment.verdict).toBe("unverified");
		expect(
			assessment.gates
				.filter(({ status }) => status === "unverified")
				.map(({ id }) => id)
		).toEqual([
			"native-frame-thresholds",
			"preview-frame-thresholds",
			"audio-thresholds",
			"keyframe-samples",
			"transition-window-samples",
			"provenance",
		]);
	});

	it("passes only when every comparison and evidence gate is verified", () => {
		const assessment = assessRoundtripCase({
			evidence: evidence({
				audioManifest: audio({ evidenceStatus: "verified" }),
				nativeManifest: nativeFrames({ evidenceStatus: "verified" }),
				previewManifest: previewFrames({ evidenceStatus: "verified" }),
			}),
			provenance: {
				evidenceStatus: "verified",
				id: "capcut-8.1-four-way-v1",
				receiptSha256: "f".repeat(64),
			},
			samplePlan: samplePlan({ verified: true }),
		});

		expect(assessment.verdict).toBe("pass");
		expect(assessment.gates.every(({ status }) => status === "pass")).toBe(
			true
		);
	});

	it("prioritizes failures over missing and unverified evidence", () => {
		const assessment = assessRoundtripCase({
			evidence: evidence({
				audioManifest: audio({ verdict: "not-comparable" }),
				nativeManifest: nativeFrames({ verdict: "fail" }),
			}),
			provenance: {
				evidenceStatus: "candidate-unverified",
				id: "local-candidate",
			},
			samplePlan: samplePlan(),
		});

		expect(assessment.verdict).toBe("fail");
		expect(assessment.gates).toContainEqual({
			id: "native-frames",
			reason: "Native frame comparison failed.",
			status: "fail",
		});
	});

	it("fails the case when QCut materialized different import state", () => {
		const assessment = assessRoundtripCase({
			evidence: evidence({
				qcutImportManifest: qcutImport({ verdict: "fail" }),
			}),
			provenance: {
				evidenceStatus: "candidate-unverified",
				id: "local-candidate",
			},
			samplePlan: samplePlan(),
		});

		expect(assessment.verdict).toBe("fail");
		expect(assessment.gates).toContainEqual({
			id: "qcut-import",
			reason: "QCut import materialization failed.",
			status: "fail",
		});
	});

	it("rejects incomplete evidence and unbound verified provenance", () => {
		const incomplete = evidence();
		incomplete.nativeFrames = undefined;
		incomplete.previewFrames = undefined;
		expect(
			assessRoundtripCase({
				evidence: incomplete,
				provenance: {
					evidenceStatus: "candidate-unverified",
					id: "local-candidate",
				},
			})
		).toMatchObject({ verdict: "not-comparable" });
		expect(() =>
			assessRoundtripCase({
				evidence: evidence(),
				provenance: {
					evidenceStatus: "verified",
					id: "forged-verification",
				},
				samplePlan: samplePlan({ verified: true }),
			})
		).toThrow("requires a receipt SHA-256");
	});
});
