/**
 * Verify a QCut renderer snapshot against the import bundle that created it.
 * Absolute input and media paths never enter the emitted evidence manifest.
 *
 * Usage:
 *   bun scripts/capcut-e2e/qcut-import-verification.ts \
 *     --bundle <qcut-import-bundle.json> \
 *     --qcut-snapshot <qcut-export-snapshot.json> \
 *     [--output <existing-dir>] [--json]
 *
 * Exit codes: 0 pass, 1 mismatch, 2 invalid/unbound inputs, 3 harness error.
 */

import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	parseJsonRecord,
	readRegularFileSnapshot,
} from "./disposable-store-control-file.js";
import {
	QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME,
	QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
	type QCutImportMaterializationEvidence,
	type QCutImportVerificationFileEvidence,
	type QCutImportVerificationManifest,
} from "./qcut-import-verification-contract.js";
import {
	describeQCutImportSnapshotMedia,
	describeQCutImportVerificationBytes,
	hashQCutImportMediaSet,
	parseQCutImportSnapshot,
	type QCutImportSnapshotMediaEvidence,
	type QCutImportSnapshotTrack,
} from "./qcut-import-snapshot.js";

export {
	QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME,
	QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
};
export type { QCutImportVerificationManifest };

const MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const PROJECT_ROOT = resolve(process.cwd());

interface ParsedImportBundle {
	bundleDigest: string;
	timelinePlan: {
		project: { fps: number; height: number; name: string; width: number };
	};
	[key: string]: unknown;
}

interface ImportBundleApi {
	canonicalizeQCutImportBundleForDigest: (options: {
		bundle: ParsedImportBundle;
	}) => string;
	parseQCutImportBundleV1: (
		value: unknown
	) =>
		| { ok: true; bundle: ParsedImportBundle }
		| { ok: false; issues: unknown[] };
}

interface ImportVerificationApi {
	verifyQCutImportMaterialization: (options: {
		actualMedia: QCutImportSnapshotMediaEvidence[];
		actualTracks: QCutImportSnapshotTrack[];
		bundle: ParsedImportBundle;
	}) => QCutImportMaterializationEvidence;
}

type QCutImportVerificationApi = ImportBundleApi & ImportVerificationApi;

async function loadModule<Shape>({
	relativePath,
	requiredExports,
}: {
	relativePath: string;
	requiredExports: string[];
}): Promise<Shape> {
	const moduleValue = (await import(
		pathToFileURL(join(PROJECT_ROOT, relativePath)).href
	)) as Record<string, unknown>;
	for (const exportName of requiredExports) {
		if (typeof moduleValue[exportName] !== "function") {
			throw new Error(`${relativePath} does not export ${exportName}.`);
		}
	}
	return moduleValue as Shape;
}

async function loadQCutImportVerificationApi(): Promise<QCutImportVerificationApi> {
	const [bundleApi, verificationApi] = await Promise.all([
		loadModule<ImportBundleApi>({
			relativePath: "packages/editor-core/src/draft-interop/import-bundle.ts",
			requiredExports: [
				"canonicalizeQCutImportBundleForDigest",
				"parseQCutImportBundleV1",
			],
		}),
		loadModule<ImportVerificationApi>({
			relativePath:
				"packages/editor-core/src/draft-interop/qcut-import-verification.ts",
			requiredExports: ["verifyQCutImportMaterialization"],
		}),
	]);
	return { ...bundleApi, ...verificationApi };
}

function buildManifestBase({
	bundleEvidence,
	nowIso,
	snapshotEvidence,
}: {
	bundleEvidence: QCutImportVerificationFileEvidence;
	nowIso: string;
	snapshotEvidence: QCutImportVerificationFileEvidence;
}) {
	return {
		bundle: bundleEvidence,
		generatedAtIso: nowIso,
		qcutSnapshot: snapshotEvidence,
		roles: {
			expected: "import-bundle" as const,
			actual: "qcut-renderer-snapshot" as const,
		},
		schema: QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
		schemaVersion: 1 as const,
	};
}

function buildNotComparableManifest({
	base,
	bundleDigest,
	checks = {
		bundleDigest: false,
		projectFps: false,
		projectGeometry: false,
		projectName: false,
	},
	reason,
}: {
	base: ReturnType<typeof buildManifestBase>;
	bundleDigest?: string;
	checks?: QCutImportVerificationManifest["checks"];
	reason: string;
}): QCutImportVerificationManifest {
	return {
		...base,
		...(bundleDigest === undefined
			? {}
			: { bundle: { ...base.bundle, bundleDigest } }),
		checks,
		notComparableReason: reason,
		verdict: "not-comparable",
	};
}

function assertManifestIsPathFree({
	inputPaths,
	manifest,
}: {
	inputPaths: readonly string[];
	manifest: QCutImportVerificationManifest;
}): void {
	const serialized = JSON.stringify(manifest);
	if (
		inputPaths
			.map((path) => resolve(path))
			.some((path) => serialized.includes(path))
	) {
		throw new Error(
			"QCut import verification manifest retained an absolute path."
		);
	}
}

async function finalizeManifest({
	inputPaths,
	manifest,
	outputDirectory,
}: {
	inputPaths: readonly string[];
	manifest: QCutImportVerificationManifest;
	outputDirectory?: string;
}): Promise<QCutImportVerificationManifest> {
	assertManifestIsPathFree({ inputPaths, manifest });
	if (outputDirectory !== undefined) {
		await writeFile(
			join(outputDirectory, QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ encoding: "utf8", flag: "wx", mode: 0o600 }
		);
	}
	return manifest;
}

function calculateBundleDigest({
	api,
	bundle,
}: {
	api: ImportBundleApi;
	bundle: ParsedImportBundle;
}): string {
	return createHash("sha256")
		.update(api.canonicalizeQCutImportBundleForDigest({ bundle }))
		.digest("hex");
}

function buildProjectChecks({
	bundle,
	snapshot,
}: {
	bundle: ParsedImportBundle;
	snapshot: ReturnType<typeof parseQCutImportSnapshot>;
}): QCutImportVerificationManifest["checks"] {
	return {
		bundleDigest: true,
		projectFps: snapshot.project.fps === bundle.timelinePlan.project.fps,
		projectGeometry:
			snapshot.project.width === bundle.timelinePlan.project.width &&
			snapshot.project.height === bundle.timelinePlan.project.height,
		projectName: snapshot.project.name === bundle.timelinePlan.project.name,
	};
}

export async function runQCutImportVerification({
	bundlePath,
	nowIso = new Date().toISOString(),
	outputDirectory,
	qcutSnapshotPath,
}: {
	bundlePath: string;
	nowIso?: string;
	outputDirectory?: string;
	qcutSnapshotPath: string;
}): Promise<QCutImportVerificationManifest> {
	const [api, bundleFile, snapshotFile] = await Promise.all([
		loadQCutImportVerificationApi(),
		readRegularFileSnapshot({
			label: "QCut import bundle",
			maximumBytes: MAXIMUM_INPUT_BYTES,
			path: bundlePath,
		}),
		readRegularFileSnapshot({
			label: "QCut renderer snapshot",
			maximumBytes: MAXIMUM_INPUT_BYTES,
			path: qcutSnapshotPath,
		}),
	]);
	const bundleEvidence = describeQCutImportVerificationBytes({
		bytes: bundleFile.bytes,
	});
	const snapshotEvidence = describeQCutImportVerificationBytes({
		bytes: snapshotFile.bytes,
	});
	const base = buildManifestBase({
		bundleEvidence,
		nowIso,
		snapshotEvidence,
	});
	const inputPaths = [bundlePath, qcutSnapshotPath];

	let bundleValue: Record<string, unknown>;
	try {
		bundleValue = parseJsonRecord({
			bytes: bundleFile.bytes,
			label: "QCut import bundle",
		});
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				reason: "Import bundle is not valid JSON.",
			}),
			outputDirectory,
		});
	}
	const parsedBundle = api.parseQCutImportBundleV1(bundleValue);
	if (!parsedBundle.ok) {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				reason: "Import bundle failed shared validation.",
			}),
			outputDirectory,
		});
	}
	const bundle = parsedBundle.bundle;
	if (calculateBundleDigest({ api, bundle }) !== bundle.bundleDigest) {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				bundleDigest: bundle.bundleDigest,
				reason: "Import bundle digest does not match its content.",
			}),
			outputDirectory,
		});
	}

	let snapshot: ReturnType<typeof parseQCutImportSnapshot>;
	try {
		snapshot = parseQCutImportSnapshot({
			value: parseJsonRecord({
				bytes: snapshotFile.bytes,
				label: "QCut renderer snapshot",
			}),
		});
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				bundleDigest: bundle.bundleDigest,
				checks: {
					bundleDigest: true,
					projectFps: false,
					projectGeometry: false,
					projectName: false,
				},
				reason: "QCut renderer snapshot failed validation.",
			}),
			outputDirectory,
		});
	}
	inputPaths.push(...snapshot.media.map(({ sourcePath }) => sourcePath));
	const checks = buildProjectChecks({ bundle, snapshot });

	let actualMedia: QCutImportSnapshotMediaEvidence[];
	try {
		actualMedia = await describeQCutImportSnapshotMedia({
			media: snapshot.media,
		});
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				bundleDigest: bundle.bundleDigest,
				checks,
				reason: "QCut snapshot media could not be verified.",
			}),
			outputDirectory,
		});
	}
	const verification = api.verifyQCutImportMaterialization({
		actualMedia,
		actualTracks: snapshot.tracks,
		bundle,
	});
	const manifest: QCutImportVerificationManifest = {
		...base,
		bundle: { ...bundleEvidence, bundleDigest: bundle.bundleDigest },
		checks,
		mediaSetSha256: hashQCutImportMediaSet({ media: actualMedia }),
		verification,
		verdict:
			verification.verdict === "pass" && Object.values(checks).every(Boolean)
				? "pass"
				: "fail",
	};
	return finalizeManifest({ inputPaths, manifest, outputDirectory });
}

const CLI_VALUE_FLAGS = ["--bundle", "--qcut-snapshot", "--output"] as const;
type CliValueFlag = (typeof CLI_VALUE_FLAGS)[number];

function isCliValueFlag({ flag }: { flag: string }): boolean {
	return CLI_VALUE_FLAGS.some((candidate) => candidate === flag);
}

function requireCliValue({
	flag,
	values,
}: {
	flag: CliValueFlag;
	values: ReadonlyMap<CliValueFlag, string>;
}): string {
	const value = values.get(flag);
	if (value === undefined) throw new Error(`Missing required flag: ${flag}`);
	return value;
}

export function parseQCutImportVerificationCliOptions({
	argv,
}: {
	argv: string[];
}): {
	bundlePath: string;
	json: boolean;
	outputDirectory?: string;
	qcutSnapshotPath: string;
} {
	const values = new Map<CliValueFlag, string>();
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index] ?? "";
		if (flag === "--json") {
			if (json) throw new Error("Duplicate flag: --json");
			json = true;
			continue;
		}
		if (!isCliValueFlag({ flag })) throw new Error(`Unknown flag: ${flag}`);
		const valueFlag = flag as CliValueFlag;
		if (values.has(valueFlag)) throw new Error(`Duplicate flag: ${flag}`);
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}`);
		}
		values.set(valueFlag, value);
		index += 1;
	}
	const outputDirectory = values.get("--output");
	return {
		bundlePath: requireCliValue({ flag: "--bundle", values }),
		json,
		...(outputDirectory === undefined ? {} : { outputDirectory }),
		qcutSnapshotPath: requireCliValue({
			flag: "--qcut-snapshot",
			values,
		}),
	};
}

async function main(): Promise<void> {
	const options = parseQCutImportVerificationCliOptions({
		argv: process.argv.slice(2),
	});
	const manifest = await runQCutImportVerification(options);
	process.stdout.write(
		options.json
			? `${JSON.stringify(manifest, null, 2)}\n`
			: `verdict: ${manifest.verdict}\n`
	);
	if (manifest.verdict === "fail") process.exitCode = 1;
	if (manifest.verdict === "not-comparable") process.exitCode = 2;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	PROJECT_ROOT,
	"scripts/capcut-e2e/qcut-import-verification.ts"
);
if (entryPath === expectedEntryPath) {
	void main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`qcut-import-verification error: ${message}\n`);
		process.exitCode = 3;
	});
}
