import { join } from "node:path";
import type { VisualFileEvidence } from "./visual-contract.js";
import {
	describeVisualFile,
	readVisualJsonFileSnapshot,
} from "./visual-files.js";
import {
	type CapCutE2eManifest,
	type CapCutE2eSourceFrameCalibrationReport,
	validateManifest,
} from "./manifest.js";

interface VisualOracleInputs {
	bundleManifest: VisualFileEvidence;
	fixtureManifest: VisualFileEvidence;
	frameA: VisualFileEvidence;
	frameB: VisualFileEvidence;
	sourceFrameCalibration: CapCutE2eSourceFrameCalibrationReport;
	sticker: VisualFileEvidence;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function requireNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number.`);
	}
	return value;
}

async function verifyFixtureArtifact({
	fileName,
	manifest,
	runDirectory,
}: {
	fileName: "source-frame-a.png" | "source-frame-b.png";
	manifest: Record<string, unknown>;
	runDirectory: string;
}): Promise<VisualFileEvidence> {
	const matches = requireArray({
		label: "Fixture artifacts",
		value: manifest.artifacts,
	})
		.map((value, index) =>
			requireRecord({ label: `Fixture artifact ${index}`, value })
		)
		.filter((artifact) => artifact.fileName === fileName);
	if (matches.length !== 1 || !matches[0]) {
		throw new Error(`Fixture manifest must contain exactly one ${fileName}.`);
	}
	const expected = matches[0];
	const evidence = await describeVisualFile({
		path: join(runDirectory, fileName),
	});
	if (
		evidence.bytes !==
			requireNumber({
				label: `${fileName} bytes`,
				value: expected.bytes,
			}) ||
		evidence.sha256 !==
			requireString({
				label: `${fileName} SHA-256`,
				value: expected.sha256,
			})
	) {
		throw new Error(`${fileName} no longer matches the fixture manifest.`);
	}
	return evidence;
}

function requireBundleCase({
	bundleManifest,
	caseId,
}: {
	bundleManifest: Record<string, unknown>;
	caseId: string;
}): Record<string, unknown> {
	const matches = requireArray({
		label: "Migration bundles",
		value: bundleManifest.bundles,
	})
		.map((value, index) =>
			requireRecord({ label: `Migration bundle ${index}`, value })
		)
		.filter((bundle) => bundle.caseId === caseId);
	if (matches.length !== 1 || !matches[0]) {
		throw new Error(`Bundle manifest must contain exactly one ${caseId} case.`);
	}
	return matches[0];
}

function validateBundleSemantics({
	bundleManifest,
}: {
	bundleManifest: Record<string, unknown>;
}): void {
	const native = requireRecord({
		label: "Native semantics",
		value: requireBundleCase({
			bundleManifest,
			caseId: "native-text-sticker",
		}).semantics,
	});
	if (
		native.systemFontFallback !== true ||
		JSON.stringify(native.textPayloads) !==
			JSON.stringify(["原生字幕验证 ABC123", "剪映真实导入测试 ABC123"])
	) {
		throw new Error("Native bundle has not passed the CJK semantic oracle.");
	}
	const dissolve = requireRecord({
		label: "Dissolve semantics",
		value: requireBundleCase({ bundleManifest, caseId: "dissolve" }).semantics,
	});
	const transition = requireRecord({
		label: "Dissolve transition semantics",
		value: dissolve.transition,
	});
	if (
		transition.durationMicroseconds !== 466_666 ||
		transition.name !== "Dissolve" ||
		requireArray({
			label: "Dissolve source ranges",
			value: dissolve.sourceRanges,
		}).length !== 2
	) {
		throw new Error("Dissolve bundle has not passed its semantic oracle.");
	}
	const lutMask = requireRecord({
		label: "LUT/mask semantics",
		value: requireBundleCase({ bundleManifest, caseId: "lut-mask" }).semantics,
	});
	const lut = requireRecord({ label: "LUT semantics", value: lutMask.lut });
	const mask = requireRecord({ label: "Mask semantics", value: lutMask.mask });
	if (
		lut.cubeSize !== 2 ||
		lut.fullInvertValueCount !== 24 ||
		mask.resourceType !== "circle" ||
		mask.width !== 0.65 ||
		mask.height !== 0.65
	) {
		throw new Error("LUT/mask bundle has not passed its semantic oracle.");
	}
}

async function verifySticker({
	bundleManifest,
	projectRoot,
}: {
	bundleManifest: Record<string, unknown>;
	projectRoot: string;
}): Promise<VisualFileEvidence> {
	const sticker = requireRecord({
		label: "Bundle sticker evidence",
		value: bundleManifest.sticker,
	});
	const geometry = requireRecord({
		label: "Bundle sticker geometry",
		value: sticker.geometry,
	});
	const alpha = requireRecord({
		label: "Bundle sticker alpha evidence",
		value: sticker.alpha,
	});
	const stickerPath = join(
		projectRoot,
		"plugins",
		"qcut",
		"assets",
		"icon.png"
	);
	if (
		sticker.path !== stickerPath ||
		geometry.width !== 512 ||
		geometry.height !== 512 ||
		alpha.minimum !== 0 ||
		alpha.maximum !== 255
	) {
		throw new Error("Bundle sticker evidence does not match the locked icon.");
	}
	const evidence = await describeVisualFile({ path: stickerPath });
	if (evidence.bytes !== sticker.bytes || evidence.sha256 !== sticker.sha256) {
		throw new Error("Plugin icon no longer matches the bundle manifest.");
	}
	return evidence;
}

export async function readVisualOracleInputs({
	projectRoot,
	runDirectory,
	runId,
}: {
	projectRoot: string;
	runDirectory: string;
	runId: string;
}): Promise<VisualOracleInputs> {
	const fixtureManifestPath = join(runDirectory, "manifest.json");
	const bundleManifestPath = join(
		runDirectory,
		"bundles",
		"bundle-run-manifest.json"
	);
	const [fixtureSnapshot, bundleSnapshot] = await Promise.all([
		readVisualJsonFileSnapshot({
			label: "Fixture manifest",
			path: fixtureManifestPath,
		}),
		readVisualJsonFileSnapshot({
			label: "Bundle manifest",
			path: bundleManifestPath,
		}),
	]);
	const fixtureManifest = fixtureSnapshot.evidence;
	const bundleManifest = bundleSnapshot.evidence;
	const fixture = requireRecord({
		label: "Fixture manifest",
		value: fixtureSnapshot.value,
	});
	const bundle = requireRecord({
		label: "Bundle manifest",
		value: bundleSnapshot.value,
	});
	if (
		fixture.schemaVersion !== 2 ||
		bundle.schemaVersion !== 1 ||
		fixture.runId !== runId ||
		bundle.runId !== runId
	) {
		throw new Error("Visual oracle inputs do not match the requested run ID.");
	}
	const typedFixture = fixture as unknown as CapCutE2eManifest;
	validateManifest({ manifest: typedFixture });
	const bundleSourceRun = requireRecord({
		label: "Bundle source run",
		value: bundle.sourceRun,
	});
	if (bundleSourceRun.manifestSha256 !== fixtureManifest.sha256) {
		throw new Error("Bundle is not bound to the current fixture manifest.");
	}
	validateBundleSemantics({ bundleManifest: bundle });
	const [frameA, frameB, sticker] = await Promise.all([
		verifyFixtureArtifact({
			fileName: "source-frame-a.png",
			manifest: fixture,
			runDirectory,
		}),
		verifyFixtureArtifact({
			fileName: "source-frame-b.png",
			manifest: fixture,
			runDirectory,
		}),
		verifySticker({ bundleManifest: bundle, projectRoot }),
	]);
	return {
		bundleManifest,
		fixtureManifest,
		frameA,
		frameB,
		sourceFrameCalibration: typedFixture.sourceFrameCalibration,
		sticker,
	};
}
