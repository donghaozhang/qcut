/**
 * Run one path-free import, semantic, native-frame, preview-frame, and audio case.
 *
 * Usage:
 *   bun scripts/capcut-e2e/roundtrip-case.ts \
 *     --case-id <id> \
 *     --source-draft <dir> --roundtrip-draft <dir> \
 *     --qcut-import-bundle <json> --qcut-import-snapshot <json> \
 *     --qcut-native-export <media> --reference-native-export <media> \
 *     --qcut-preview-frames <dir> --reference-preview-frames <dir> \
 *     [--output <dir>] [--json]
 *
 * Exit codes: 0 verified pass, 1 comparison failure, 2 unverified or not
 * comparable, 3 harness error.
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compareAudioOutputs } from "./audio-comparison.js";
import { compareVideoFrames } from "./frame-comparison.js";
import { buildFrameSamplePlan } from "./frame-sample-plan.js";
import { comparePreviewFrameDirectories } from "./preview-frame-comparison.js";
import { runQCutImportVerification } from "./qcut-import-verification.js";
import {
	assessRoundtripCase,
	ROUNDTRIP_CASE_MANIFEST_FILE_NAME,
	ROUNDTRIP_CASE_MANIFEST_SCHEMA,
	type RoundtripCaseManifest,
	type RoundtripCaseProvenance,
	UNBOUND_ROUNDTRIP_CASE_PROVENANCE,
	validateRoundtripCaseProvenance,
} from "./roundtrip-case-contract.js";
import {
	buildSemanticDiffCaseManifest,
	loadSemanticDiffApi,
	normalizeDraftForSemanticDiff,
} from "./semantic-diff.js";

export { ROUNDTRIP_CASE_MANIFEST_FILE_NAME, ROUNDTRIP_CASE_MANIFEST_SCHEMA };

const ROUNDTRIP_CASE_ROLES = Object.freeze({
	audio: { left: "reference" as const, right: "qcut" as const },
	nativeFrames: { left: "reference" as const, right: "qcut" as const },
	previewFrames: { left: "reference" as const, right: "qcut" as const },
	qcutImport: {
		expected: "import-bundle" as const,
		actual: "qcut-renderer-snapshot" as const,
	},
	semantic: {
		left: "source-draft" as const,
		right: "roundtrip-draft" as const,
	},
});

export interface RoundtripCaseDependencies {
	buildFrameSamplePlan: typeof buildFrameSamplePlan;
	buildSemanticDiffCaseManifest: typeof buildSemanticDiffCaseManifest;
	compareAudioOutputs: typeof compareAudioOutputs;
	comparePreviewFrameDirectories: typeof comparePreviewFrameDirectories;
	compareVideoFrames: typeof compareVideoFrames;
	loadSemanticDiffApi: typeof loadSemanticDiffApi;
	normalizeDraftForSemanticDiff: typeof normalizeDraftForSemanticDiff;
	runQCutImportVerification: typeof runQCutImportVerification;
}

const DEFAULT_DEPENDENCIES: RoundtripCaseDependencies = {
	buildFrameSamplePlan,
	buildSemanticDiffCaseManifest,
	compareAudioOutputs,
	comparePreviewFrameDirectories,
	compareVideoFrames,
	loadSemanticDiffApi,
	normalizeDraftForSemanticDiff,
	runQCutImportVerification,
};

export interface RunRoundtripCaseOptions {
	caseId: string;
	dependencies?: RoundtripCaseDependencies;
	nowIso?: string;
	outputDirectory?: string;
	provenance?: RoundtripCaseProvenance;
	qcutImportBundlePath: string;
	qcutImportSnapshotPath: string;
	qcutNativeExportPath: string;
	qcutPreviewDirectory: string;
	referenceNativeExportPath: string;
	referencePreviewDirectory: string;
	roundtripDraftDirectory: string;
	sourceDraftDirectory: string;
}

export interface RoundtripCaseCliOptions
	extends Omit<
		RunRoundtripCaseOptions,
		"dependencies" | "nowIso" | "provenance"
	> {
	json: boolean;
}

function validateCaseId({ caseId }: { caseId: string }): void {
	if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(caseId)) {
		throw new Error("Round-trip case ID is invalid.");
	}
}

function assertManifestIsPathFree({
	inputPaths,
	manifest,
}: {
	inputPaths: string[];
	manifest: RoundtripCaseManifest;
}): void {
	const serialized = JSON.stringify(manifest);
	const leakedPath = inputPaths
		.map((path) => resolve(path))
		.find((path) => serialized.includes(path));
	if (leakedPath) {
		throw new Error("Round-trip evidence manifest retained an absolute path.");
	}
}

async function writeManifest({
	manifest,
	outputDirectory,
}: {
	manifest: RoundtripCaseManifest;
	outputDirectory?: string;
}): Promise<void> {
	if (!outputDirectory) return;
	await writeFile(
		join(outputDirectory, ROUNDTRIP_CASE_MANIFEST_FILE_NAME),
		`${JSON.stringify(manifest, null, 2)}\n`,
		{ encoding: "utf8", flag: "wx", mode: 0o600 }
	);
}

export async function runRoundtripCase({
	caseId,
	dependencies = DEFAULT_DEPENDENCIES,
	nowIso = new Date().toISOString(),
	outputDirectory,
	provenance = UNBOUND_ROUNDTRIP_CASE_PROVENANCE,
	qcutImportBundlePath,
	qcutImportSnapshotPath,
	qcutNativeExportPath,
	qcutPreviewDirectory,
	referenceNativeExportPath,
	referencePreviewDirectory,
	roundtripDraftDirectory,
	sourceDraftDirectory,
}: RunRoundtripCaseOptions): Promise<RoundtripCaseManifest> {
	validateCaseId({ caseId });
	validateRoundtripCaseProvenance({ provenance });
	const [api, qcutImport] = await Promise.all([
		dependencies.loadSemanticDiffApi(),
		dependencies.runQCutImportVerification({
			bundlePath: qcutImportBundlePath,
			nowIso,
			qcutSnapshotPath: qcutImportSnapshotPath,
		}),
	]);
	const [source, roundtrip] = await Promise.all([
		dependencies.normalizeDraftForSemanticDiff({
			api,
			draftDirectory: sourceDraftDirectory,
		}),
		dependencies.normalizeDraftForSemanticDiff({
			api,
			draftDirectory: roundtripDraftDirectory,
		}),
	]);
	const semantic = dependencies.buildSemanticDiffCaseManifest({
		api,
		left: source,
		nowIso,
		right: roundtrip,
	});
	const samplePlan = source.document
		? dependencies.buildFrameSamplePlan({ document: source.document })
		: undefined;
	const audioPromise = dependencies.compareAudioOutputs({
		leftPath: referenceNativeExportPath,
		nowIso,
		rightPath: qcutNativeExportPath,
	});
	const [audio, nativeFrames, previewFrames] = samplePlan
		? await Promise.all([
				audioPromise,
				dependencies.compareVideoFrames({
					leftPath: referenceNativeExportPath,
					nowIso,
					plan: samplePlan,
					rightPath: qcutNativeExportPath,
				}),
				dependencies.comparePreviewFrameDirectories({
					leftDirectory: referencePreviewDirectory,
					nowIso,
					plan: samplePlan,
					rightDirectory: qcutPreviewDirectory,
				}),
			])
		: [await audioPromise, undefined, undefined];
	const evidence = {
		audio,
		...(nativeFrames ? { nativeFrames } : {}),
		...(previewFrames ? { previewFrames } : {}),
		qcutImport,
		semantic,
	};
	const assessment = assessRoundtripCase({
		evidence,
		provenance,
		...(samplePlan ? { samplePlan } : {}),
	});
	const manifest: RoundtripCaseManifest = {
		caseId,
		evidence,
		generatedAtIso: nowIso,
		gates: assessment.gates,
		provenance,
		roles: ROUNDTRIP_CASE_ROLES,
		...(samplePlan ? { samplePlan } : {}),
		schema: ROUNDTRIP_CASE_MANIFEST_SCHEMA,
		schemaVersion: 2,
		verdict: assessment.verdict,
	};
	assertManifestIsPathFree({
		inputPaths: [
			sourceDraftDirectory,
			roundtripDraftDirectory,
			qcutImportBundlePath,
			qcutImportSnapshotPath,
			qcutNativeExportPath,
			referenceNativeExportPath,
			qcutPreviewDirectory,
			referencePreviewDirectory,
		],
		manifest,
	});
	await writeManifest({ manifest, outputDirectory });
	return manifest;
}

const CLI_VALUE_FLAGS = [
	"--case-id",
	"--source-draft",
	"--roundtrip-draft",
	"--qcut-import-bundle",
	"--qcut-import-snapshot",
	"--qcut-native-export",
	"--reference-native-export",
	"--qcut-preview-frames",
	"--reference-preview-frames",
	"--output",
] as const;

type CliValueFlag = (typeof CLI_VALUE_FLAGS)[number];

function isCliValueFlag({ flag }: { flag: string }): boolean {
	return CLI_VALUE_FLAGS.some((candidate) => candidate === flag);
}

function requireCliValue({
	flag,
	values,
}: {
	flag: CliValueFlag;
	values: Map<CliValueFlag, string>;
}): string {
	const value = values.get(flag);
	if (value === undefined) {
		throw new Error(`Missing required flag: ${flag}`);
	}
	return value;
}

export function parseRoundtripCaseCliOptions({
	argv,
}: {
	argv: string[];
}): RoundtripCaseCliOptions {
	const values = new Map<CliValueFlag, string>();
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index] ?? "";
		if (flag === "--json") {
			if (json) throw new Error("Duplicate flag: --json");
			json = true;
			continue;
		}
		if (!isCliValueFlag({ flag })) {
			throw new Error(`Unknown flag: ${flag}`);
		}
		const valueFlag = flag as CliValueFlag;
		if (values.has(valueFlag)) throw new Error(`Duplicate flag: ${flag}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		values.set(valueFlag, value);
		index += 1;
	}
	const caseId = requireCliValue({ flag: "--case-id", values });
	const sourceDraftDirectory = requireCliValue({
		flag: "--source-draft",
		values,
	});
	const roundtripDraftDirectory = requireCliValue({
		flag: "--roundtrip-draft",
		values,
	});
	const qcutImportBundlePath = requireCliValue({
		flag: "--qcut-import-bundle",
		values,
	});
	const qcutImportSnapshotPath = requireCliValue({
		flag: "--qcut-import-snapshot",
		values,
	});
	const qcutNativeExportPath = requireCliValue({
		flag: "--qcut-native-export",
		values,
	});
	const referenceNativeExportPath = requireCliValue({
		flag: "--reference-native-export",
		values,
	});
	const qcutPreviewDirectory = requireCliValue({
		flag: "--qcut-preview-frames",
		values,
	});
	const referencePreviewDirectory = requireCliValue({
		flag: "--reference-preview-frames",
		values,
	});
	return {
		caseId,
		json,
		...(values.has("--output")
			? { outputDirectory: requireCliValue({ flag: "--output", values }) }
			: {}),
		qcutImportBundlePath,
		qcutImportSnapshotPath,
		qcutNativeExportPath,
		qcutPreviewDirectory,
		referenceNativeExportPath,
		referencePreviewDirectory,
		roundtripDraftDirectory,
		sourceDraftDirectory,
	};
}

async function main(): Promise<void> {
	const options = parseRoundtripCaseCliOptions({
		argv: process.argv.slice(2),
	});
	const manifest = await runRoundtripCase(options);
	process.stdout.write(
		options.json
			? `${JSON.stringify(manifest, null, 2)}\n`
			: `case: ${manifest.caseId}\nverdict: ${manifest.verdict}\n`
	);
	if (manifest.verdict === "fail") process.exitCode = 1;
	if (
		manifest.verdict === "not-comparable" ||
		manifest.verdict === "unverified"
	) {
		process.exitCode = 2;
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	resolve(process.cwd()),
	"scripts",
	"capcut-e2e",
	"roundtrip-case.ts"
);
if (entryPath === expectedEntryPath) {
	void main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`roundtrip-case error: ${message}\n`);
		process.exitCode = 3;
	});
}
