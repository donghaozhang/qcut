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
	document: { source: { profileId: string } };
	planToken: string;
	timelinePlan: {
		project: { fps: number; height: number; name: string; width: number };
	};
	[key: string]: unknown;
}

interface PersistedImportEvidenceBinding {
	bundleDigest: string;
	importId: string;
	profileId: string;
}

interface ParsedPersistedImportEvidenceSnapshot {
	binding: PersistedImportEvidenceBinding;
	capture: {
		appVersion: string;
		capturedAtIso: string;
		readPasses: 2;
		source: "qcut-renderer-persisted-storage";
	};
	media: QCutImportSnapshotMediaEvidence[];
	project: {
		fps: number;
		height: number;
		id: string;
		name: string;
		sceneId: string;
		width: number;
	};
	schema: string;
	schemaVersion: 1;
	tracks: QCutImportSnapshotTrack[];
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

interface PersistedImportEvidenceApi {
	parseSnapshot: (options: {
		value: unknown;
	}) => ParsedPersistedImportEvidenceSnapshot;
	schema: string;
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

async function loadPersistedImportEvidenceApi(): Promise<PersistedImportEvidenceApi> {
	const [contractModule, validationModule] = (await Promise.all([
		import(
			pathToFileURL(
				join(PROJECT_ROOT, "electron/types/qcut-import-evidence-api.ts")
			).href
		),
		import(
			pathToFileURL(
				join(PROJECT_ROOT, "electron/types/qcut-import-evidence-validation.ts")
			).href
		),
	])) as [Record<string, unknown>, Record<string, unknown>];
	const schema = contractModule.QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA;
	const parseSnapshot =
		validationModule.parseQCutPersistedImportEvidenceSnapshot;
	if (typeof schema !== "string" || typeof parseSnapshot !== "function") {
		throw new Error("Persisted import evidence API is incomplete.");
	}
	return {
		parseSnapshot: parseSnapshot as PersistedImportEvidenceApi["parseSnapshot"],
		schema,
	};
}

type QCutImportVerificationManifestBase = Omit<
	QCutImportVerificationManifest,
	| "checks"
	| "mediaSetSha256"
	| "notComparableReason"
	| "verification"
	| "verdict"
>;

function buildManifestBase({
	bundleEvidence,
	nowIso,
	snapshotEvidence,
}: {
	bundleEvidence: QCutImportVerificationFileEvidence;
	nowIso: string;
	snapshotEvidence: QCutImportVerificationFileEvidence;
}): QCutImportVerificationManifestBase {
	return {
		bundle: bundleEvidence,
		capture: { source: "unknown" as const },
		generatedAtIso: nowIso,
		qcutSnapshot: snapshotEvidence,
		roles: {
			expected: "import-bundle" as const,
			actual: "qcut-renderer-snapshot" as const,
		},
		schema: QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA,
		schemaVersion: 2 as const,
	};
}

function buildNotComparableManifest({
	base,
	bundleDigest,
	checks = {
		bundleDigest: false,
		captureTrusted: false,
		importId: false,
		profileId: false,
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
	binding,
	bundle,
	project,
	trusted,
}: {
	binding?: PersistedImportEvidenceBinding;
	bundle: ParsedImportBundle;
	project: { fps: number; height: number; name: string; width: number };
	trusted: boolean;
}): QCutImportVerificationManifest["checks"] {
	return {
		bundleDigest: binding?.bundleDigest === bundle.bundleDigest,
		captureTrusted: trusted,
		importId: binding?.importId === bundle.planToken,
		profileId: binding?.profileId === bundle.document.source.profileId,
		projectFps: project.fps === bundle.timelinePlan.project.fps,
		projectGeometry:
			project.width === bundle.timelinePlan.project.width &&
			project.height === bundle.timelinePlan.project.height,
		projectName: project.name === bundle.timelinePlan.project.name,
	};
}

function buildComparedManifest({
	actualMedia,
	actualTracks,
	api,
	base,
	bundle,
	capture,
	checks,
}: {
	actualMedia: QCutImportSnapshotMediaEvidence[];
	actualTracks: QCutImportSnapshotTrack[];
	api: ImportVerificationApi;
	base: ReturnType<typeof buildManifestBase>;
	bundle: ParsedImportBundle;
	capture: QCutImportVerificationManifest["capture"];
	checks: QCutImportVerificationManifest["checks"];
}): QCutImportVerificationManifest {
	const verification = api.verifyQCutImportMaterialization({
		actualMedia,
		actualTracks,
		bundle,
	});
	const projectChecksPassed =
		checks.projectFps && checks.projectGeometry && checks.projectName;
	const trustedChecksPassed =
		checks.captureTrusted &&
		checks.bundleDigest &&
		checks.importId &&
		checks.profileId;
	const materializationFailed =
		verification.verdict === "fail" || !projectChecksPassed;
	const trustedBindingFailed = checks.captureTrusted && !trustedChecksPassed;
	const verdict: QCutImportVerificationManifest["verdict"] =
		materializationFailed || trustedBindingFailed
			? "fail"
			: trustedChecksPassed
				? "pass"
				: "not-comparable";
	return {
		...base,
		bundle: { ...base.bundle, bundleDigest: bundle.bundleDigest },
		capture,
		checks,
		mediaSetSha256: hashQCutImportMediaSet({ media: actualMedia }),
		...(verdict === "not-comparable"
			? {
					notComparableReason:
						"Snapshot was not captured from trusted QCut persisted storage.",
				}
			: {}),
		verification,
		verdict,
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
	const [api, persistedEvidenceApi, bundleFile, snapshotFile] =
		await Promise.all([
			loadQCutImportVerificationApi(),
			loadPersistedImportEvidenceApi(),
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

	let snapshotValue: Record<string, unknown>;
	try {
		snapshotValue = parseJsonRecord({
			bytes: snapshotFile.bytes,
			label: "QCut renderer snapshot",
		});
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				bundleDigest: bundle.bundleDigest,
				reason: "QCut renderer snapshot failed validation.",
			}),
			outputDirectory,
		});
	}

	if (snapshotValue.schema === persistedEvidenceApi.schema) {
		let snapshot: ParsedPersistedImportEvidenceSnapshot;
		try {
			snapshot = persistedEvidenceApi.parseSnapshot({
				value: snapshotValue,
			});
		} catch {
			return finalizeManifest({
				inputPaths,
				manifest: buildNotComparableManifest({
					base,
					bundleDigest: bundle.bundleDigest,
					reason: "Trusted QCut persisted snapshot failed validation.",
				}),
				outputDirectory,
			});
		}
		const checks = buildProjectChecks({
			binding: snapshot.binding,
			bundle,
			project: snapshot.project,
			trusted: true,
		});
		const manifest = buildComparedManifest({
			actualMedia: snapshot.media,
			actualTracks: snapshot.tracks,
			api,
			base,
			bundle,
			capture: {
				appVersion: snapshot.capture.appVersion,
				source: snapshot.capture.source,
			},
			checks,
		});
		return finalizeManifest({ inputPaths, manifest, outputDirectory });
	}

	let snapshot: ReturnType<typeof parseQCutImportSnapshot>;
	try {
		snapshot = parseQCutImportSnapshot({ value: snapshotValue });
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base,
				bundleDigest: bundle.bundleDigest,
				reason: "QCut renderer snapshot failed validation.",
			}),
			outputDirectory,
		});
	}
	inputPaths.push(...snapshot.media.map(({ sourcePath }) => sourcePath));
	const checks = buildProjectChecks({
		bundle,
		project: snapshot.project,
		trusted: false,
	});
	let actualMedia: QCutImportSnapshotMediaEvidence[];
	try {
		actualMedia = await describeQCutImportSnapshotMedia({
			media: snapshot.media,
		});
	} catch {
		return finalizeManifest({
			inputPaths,
			manifest: buildNotComparableManifest({
				base: { ...base, capture: { source: "manual-path-snapshot" } },
				bundleDigest: bundle.bundleDigest,
				checks,
				reason: "QCut snapshot media could not be verified.",
			}),
			outputDirectory,
		});
	}
	const manifest = buildComparedManifest({
		actualMedia,
		actualTracks: snapshot.tracks,
		api,
		base,
		bundle,
		capture: { source: "manual-path-snapshot" },
		checks,
	});
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
