import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { requireGuiEvidenceFiles } from "./gui-regression-evidence.js";
import { requireCanonicalPath } from "./gui-regression-filesystem.js";
import {
	type VisualCaptureEvidence,
	type VisualFileEvidence,
	type VisualOracleManifest,
	validateVisualOracleManifest,
} from "./visual-contract.js";
import { getDissolveFileName } from "./visual-dissolve.js";
import {
	describeVisualCapture,
	describeVisualFile,
	readVisualJsonFileSnapshot,
} from "./visual-files.js";

async function assertFileEvidenceCurrent({
	evidence,
}: {
	evidence: VisualFileEvidence;
}) {
	const current = await describeVisualFile({ path: evidence.path });
	if (!isDeepStrictEqual(current, evidence)) {
		throw new Error(`Visual oracle file evidence changed: ${evidence.path}`);
	}
}

async function assertCaptureCurrent({
	capture,
	capturesDirectory,
	expectedPath,
	ownerUid,
}: {
	capture: VisualCaptureEvidence;
	capturesDirectory: string;
	expectedPath: string;
	ownerUid: number;
}) {
	if (capture.path !== expectedPath) {
		throw new Error(
			`Visual oracle capture path is not mapped: ${capture.path}`
		);
	}
	const current = await describeVisualCapture({
		capturesDirectory,
		path: expectedPath,
	});
	if (!isDeepStrictEqual(current, capture)) {
		throw new Error(`Visual oracle capture changed: ${expectedPath}`);
	}
	if (!capture.exists) return;
	const [owned] = await requireGuiEvidenceFiles({
		evidencePaths: [capture.path],
		ownerUid,
	});
	if (
		!owned ||
		owned.bytes !== capture.bytes ||
		owned.path !== capture.path ||
		owned.sha256 !== capture.sha256
	) {
		throw new Error(`Visual oracle capture ownership changed: ${capture.path}`);
	}
}

export async function loadBoundGuiVisualOracle({
	bundleManifestPath,
	evidenceDirectory,
	ownerUid,
	runId,
	visualOracleManifestPath,
}: {
	bundleManifestPath: string;
	evidenceDirectory: string;
	ownerUid: number;
	runId: string;
	visualOracleManifestPath: string;
}) {
	await requireCanonicalPath({
		expectedKind: "file",
		label: "Visual oracle manifest",
		path: visualOracleManifestPath,
	});
	const snapshot = await readVisualJsonFileSnapshot({
		label: "Visual oracle manifest",
		path: visualOracleManifestPath,
	});
	const oracle = snapshot.value as VisualOracleManifest;
	validateVisualOracleManifest({ manifest: oracle });
	const capturesDirectory = join(evidenceDirectory, "visual-captures");
	if (
		oracle.runId !== runId ||
		oracle.capturesDirectory !== capturesDirectory ||
		oracle.source.bundleManifest.path !== bundleManifestPath
	) {
		throw new Error(
			"Visual oracle is not bound to the GUI run capture directory."
		);
	}
	await requireCanonicalPath({
		expectedKind: "directory",
		label: "GUI visual captures directory",
		path: capturesDirectory,
	});
	await Promise.all([
		...Object.values(oracle.source).map((evidence) =>
			assertFileEvidenceCurrent({ evidence })
		),
		assertFileEvidenceCurrent({ evidence: oracle.sticker.source }),
		assertFileEvidenceCurrent({ evidence: oracle.lutMask.expected }),
		...oracle.dissolve.samples.map(({ expected }) =>
			assertFileEvidenceCurrent({ evidence: expected })
		),
		assertCaptureCurrent({
			capture: oracle.sticker.reopenedAsset,
			capturesDirectory,
			expectedPath: join(capturesDirectory, "sticker", "reopened-icon.png"),
			ownerUid,
		}),
		assertCaptureCurrent({
			capture: oracle.lutMask.capture,
			capturesDirectory,
			expectedPath: join(
				capturesDirectory,
				"lut-mask",
				"reopened-lut-mask.png"
			),
			ownerUid,
		}),
		...oracle.dissolve.samples.map((sample, index) => {
			const planned = oracle.dissolve.framePlan.samples[index];
			if (!planned) throw new Error(`Missing dissolve frame plan ${index}.`);
			return assertCaptureCurrent({
				capture: sample.capture,
				capturesDirectory,
				expectedPath: join(
					capturesDirectory,
					"dissolve",
					getDissolveFileName({ sample: planned })
				),
				ownerUid,
			});
		}),
	]);
	return { evidence: snapshot.evidence, oracle };
}
