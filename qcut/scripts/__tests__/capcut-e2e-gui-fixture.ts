import { createHash } from "node:crypto";
import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, relative } from "node:path";
import {
	CAPCUT_E2E_SENTINEL_FILE_NAME,
	CAPCUT_E2E_SENTINEL_PURPOSE,
	CAPCUT_E2E_SENTINEL_SCHEMA,
	CAPCUT_E2E_SENTINEL_VERSION,
	preflightDisposableCapCutStore,
} from "../capcut-e2e/disposable-store-guard.js";
import type { CapCutGuiBundleVerifier } from "../capcut-e2e/gui-regression-bundle-verification.js";
import {
	CAPCUT_GUI_CASE_IDS,
	type CapCutGuiAssetIntegrity,
} from "../capcut-e2e/gui-regression-contract.js";
import {
	CAPCUT_GUI_EXECUTION_CONFIRMATION,
	CAPCUT_GUI_EXECUTION_SENTINEL_FILE_NAME,
	CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE,
	CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA,
	CAPCUT_GUI_EXECUTION_SENTINEL_VERSION,
} from "../capcut-e2e/gui-regression-execution-sentinel.js";
import {
	readOwnerUid,
	type CapCutGuiProcessIdentity,
} from "../capcut-e2e/gui-regression-identity.js";
import { capCutGuiRegressionPreflightTesting } from "../capcut-e2e/gui-regression-preflight.js";
import type {
	CapCutGuiSessionInspector,
	CapCutGuiSessionReport,
} from "../capcut-e2e/gui-regression-session-guard.js";
import {
	createBundleSemanticFixture,
	INVERT_LUT,
} from "./capcut-e2e-bundle-semantic-fixture.js";
import {
	inspectFixtureCapCutApp,
	writeFixtureCapCutApp,
} from "./capcut-e2e-gui-app-fixture.js";
import type {
	FixtureBundle,
	GuiFixture,
} from "./capcut-e2e-gui-fixture-types.js";

export type {
	FixtureBundle,
	GuiFixture,
} from "./capcut-e2e-gui-fixture-types.js";

export {
	createInfoPlist,
	getFixtureCapCutSystemFontPath,
	writeFixtureCapCutApp,
} from "./capcut-e2e-gui-app-fixture.js";

const temporaryDirectories: string[] = [];

export function getProcessUid(): number {
	if (typeof process.geteuid !== "function") {
		throw new Error("GUI regression tests require a POSIX UID.");
	}
	return process.geteuid();
}

function sha256Text({ value }: { value: string }): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function writeJson({
	path,
	value,
}: {
	path: string;
	value: unknown;
}): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createFixtureBundle({
	caseId,
	index,
	root,
}: {
	caseId: (typeof CAPCUT_GUI_CASE_IDS)[number];
	index: number;
	root: string;
}): Promise<FixtureBundle> {
	const draftFolderName = `draft-${index + 1}`;
	const draftName = `GUI ${caseId}`;
	const ids = {
		draftId: `draft-id-${index + 1}`,
		placeholderId: `placeholder-id-${index + 1}`,
		projectId: `project-id-${index + 1}`,
		timelineId: `timeline-id-${index + 1}`,
	};
	const bundleDirectory = join(root, "bundles", caseId);
	const draftDirectory = join(
		bundleDirectory,
		"com.lveditor.draft",
		draftFolderName
	);
	const assetDirectory = join(draftDirectory, "assets");
	const timelineDirectory = join(draftDirectory, "Timelines", ids.timelineId);
	await Promise.all([
		mkdir(assetDirectory, { recursive: true }),
		mkdir(timelineDirectory, { recursive: true }),
	]);
	const contentText = JSON.stringify(createBundleSemanticFixture({ caseId }));
	const contentRelativePaths = [
		"draft_info.json",
		"template-2.tmp",
		`Timelines/${ids.timelineId}/draft_info.json`,
		`Timelines/${ids.timelineId}/template-2.tmp`,
	] as const;
	const copiedAssetText = `copied-${caseId}`;
	const copiedAssetPath = join(assetDirectory, "source.bin");
	const generatedAssetPath = join(assetDirectory, "invert.cube");
	await Promise.all([
		...contentRelativePaths.map((relativePath) =>
			writeFile(
				join(draftDirectory, ...relativePath.split("/")),
				contentText,
				"utf8"
			)
		),
		writeFile(copiedAssetPath, copiedAssetText, "utf8"),
		...(caseId === "lut-mask"
			? [writeFile(generatedAssetPath, INVERT_LUT, "utf8")]
			: []),
	]);
	const copiedAssets = [
		{
			bytes: Buffer.byteLength(copiedAssetText),
			relativePath: relative(draftDirectory, copiedAssetPath),
			sha256: sha256Text({ value: copiedAssetText }),
		},
	];
	const generatedAssets =
		caseId === "lut-mask"
			? [
					{
						bytes: Buffer.byteLength(INVERT_LUT),
						relativePath: "assets/invert.cube",
						sha256: sha256Text({ value: INVERT_LUT }),
					},
				]
			: [];
	const completeMarkerPath = join(bundleDirectory, "QCUT_EXPORT_COMPLETE.json");
	const migrationManifestPath = join(
		bundleDirectory,
		"qcut-capcut-migration-manifest.json"
	);
	const completeMarkerText = `${JSON.stringify({ complete: true, caseId })}\n`;
	const migrationManifestText = `${JSON.stringify({ caseId, ids })}\n`;
	await Promise.all([
		writeFile(completeMarkerPath, completeMarkerText, "utf8"),
		writeFile(migrationManifestPath, migrationManifestText, "utf8"),
	]);
	const content = {
		bytes: Buffer.byteLength(contentText),
		sha256: sha256Text({ value: contentText }),
	};
	const draftFiles = [
		...contentRelativePaths.map((relativePath) => ({
			bytes: content.bytes,
			relativePath,
			sha256: content.sha256,
		})),
		...(copiedAssets[0] ? [copiedAssets[0]] : []),
		...generatedAssets,
	];
	return {
		bundleDirectory,
		caseId,
		completeMarkerPath,
		content,
		contentText,
		copiedAssets,
		draftDirectory,
		draftDirectories: ["assets", "Timelines", `Timelines/${ids.timelineId}`],
		draftFiles,
		draftFolderName,
		draftId: ids.draftId,
		draftName,
		generatedAssets,
		ids,
		migrationManifestPath,
		timelineMaterialsSize: 1_000 + index,
	};
}

function createFixtureVerifier({
	bundles,
}: {
	bundles: FixtureBundle[];
}): CapCutGuiBundleVerifier {
	return async ({ outputDirectory }) => {
		const bundle = bundles.find(
			(candidate) => candidate.bundleDirectory === outputDirectory
		);
		if (!bundle)
			throw new Error(`Unexpected fixture bundle ${outputDirectory}.`);
		const bundleRelativeAsset = (asset: CapCutGuiAssetIntegrity) => ({
			...asset,
			relativePath: posix.join(
				"com.lveditor.draft",
				bundle.draftFolderName,
				asset.relativePath
			),
		});
		return {
			contentText: bundle.contentText,
			draftDirectories: bundle.draftDirectories,
			draftFiles: bundle.draftFiles,
			draftFolderName: bundle.draftFolderName,
			manifest: {
				assets: bundle.copiedAssets.map(bundleRelativeAsset),
				content: bundle.content,
				generatedAssets: bundle.generatedAssets.map(bundleRelativeAsset),
				ids: bundle.ids,
				timelineMaterialsSize: bundle.timelineMaterialsSize,
			},
			outputDirectory,
		};
	};
}

export async function createGuiFixture(): Promise<GuiFixture> {
	const requestedRoot = await mkdtemp(
		join(tmpdir(), "qcut-capcut-gui-regression-")
	);
	temporaryDirectories.push(requestedRoot);
	const root = await realpath(requestedRoot);
	const dedicatedTestHomeDirectory = join(root, "dedicated-home");
	const storePath = join(
		dedicatedTestHomeDirectory,
		"Movies",
		"CapCut",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
	await mkdir(storePath, { recursive: true });
	const [canonicalHomePath, canonicalStorePath] = await Promise.all([
		realpath(dedicatedTestHomeDirectory),
		realpath(storePath),
	]);
	const rootMetaInfoPath = join(storePath, "root_meta_info.json");
	await Promise.all([
		writeJson({
			path: rootMetaInfoPath,
			value: {
				all_draft_store: [],
				draft_ids: 0,
				root_path: canonicalStorePath,
			},
		}),
		writeJson({
			path: join(storePath, CAPCUT_E2E_SENTINEL_FILE_NAME),
			value: {
				canonicalStorePath,
				purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
				schema: CAPCUT_E2E_SENTINEL_SCHEMA,
				version: CAPCUT_E2E_SENTINEL_VERSION,
			},
		}),
	]);
	const appPath = join(root, "Applications", "CapCut.app");
	await writeFixtureCapCutApp({ appPath });
	const bundles = await Promise.all(
		CAPCUT_GUI_CASE_IDS.map((caseId, index) =>
			createFixtureBundle({ caseId, index, root })
		)
	);
	const runId = "isolated-gui-run";
	const bundleManifestPath = join(root, "bundles", "bundle-run-manifest.json");
	await writeJson({
		path: bundleManifestPath,
		value: {
			bundles: await Promise.all(
				bundles.map(async (bundle) => ({
					caseId: bundle.caseId,
					copiedAssets: bundle.copiedAssets,
					draftName: bundle.draftName,
					generatedAssets: bundle.generatedAssets,
					hashes: {
						completeMarkerSha256: sha256Text({
							value: await readFileText({ path: bundle.completeMarkerPath }),
						}),
						contentSha256: bundle.content.sha256,
						migrationManifestSha256: sha256Text({
							value: await readFileText({ path: bundle.migrationManifestPath }),
						}),
					},
					ids: bundle.ids,
					paths: {
						bundleDirectory: bundle.bundleDirectory,
						completeMarker: bundle.completeMarkerPath,
						draftDirectory: bundle.draftDirectory,
						migrationManifest: bundle.migrationManifestPath,
					},
					verification: {
						draftFileCount: bundle.draftFiles.length,
						timelineMaterialsSize: bundle.timelineMaterialsSize,
						totalDraftFileBytes: bundle.draftFiles.reduce(
							(sum, { bytes }) => sum + bytes,
							0
						),
					},
				}))
			),
			runId,
			schemaVersion: 1,
			targetPlatform: "macos",
		},
	});
	return {
		appPath,
		bundleManifestPath,
		bundles,
		canonicalHomePath,
		canonicalStorePath,
		dedicatedTestHomeDirectory,
		inspectApp: inspectFixtureCapCutApp,
		rootMetaInfoPath,
		runId,
		verifyBundle: createFixtureVerifier({ bundles }),
	};
}

async function readFileText({ path }: { path: string }): Promise<string> {
	return readFile(path, "utf8");
}

export function createIdentity({
	homePath,
	username = "qcut-e2e",
}: {
	homePath: string;
	username?: string;
}): CapCutGuiProcessIdentity {
	return {
		accountUid: getProcessUid(),
		environmentHomePath: homePath,
		osHomePath: homePath,
		processUid: getProcessUid(),
		userInfoHomePath: homePath,
		username,
	};
}

export function createFixtureSessionInspector(): CapCutGuiSessionInspector {
	let generation = 0;
	let wasRunning = false;
	return async ({ app, expectation, identity, store }) => {
		const containerPath = join(
			identity.userInfoHomePath,
			"Library",
			"Containers",
			"com.lemon.lvoverseas"
		);
		const isRunning = expectation.processState === "present";
		if (isRunning && !wasRunning) generation += 1;
		wasRunning = isRunning;
		const processId = 4242 + generation;
		const processes = isRunning
			? [
					{
						canonicalExecutablePath: app.executablePath,
						executableDeviceId: app.executableIntegrity.device,
						executableInode: app.executableIntegrity.inode,
						executablePath: app.executablePath,
						pgid: processId,
						pid: processId,
						ppid: 1,
						startIdentity: `Sat Aug 1 12:00:${String(generation).padStart(2, "0")} 2026`,
						uid: identity.processUid,
					},
				]
			: [];
		return {
			consoleDevicePath: "/dev/console",
			consoleOwnerUid: identity.processUid,
			container: {
				canonicalPath: containerPath,
				identity: createFixtureFileIdentity({
					inode: "31",
					ownerUid: identity.processUid,
				}),
				ownerUid: identity.processUid,
				path: containerPath,
				status: "present",
			},
			processes,
			store: {
				canonicalPath: store.canonicalStorePath,
				identity: createFixtureFileIdentity({
					inode: "32",
					ownerUid: identity.processUid,
				}),
				ownerUid: identity.processUid,
				path: store.canonicalStorePath,
				status: "present",
			},
		} satisfies CapCutGuiSessionReport;
	};
}

function createFixtureFileIdentity({
	inode,
	ownerUid,
}: {
	inode: string;
	ownerUid: number;
}) {
	return {
		changedTimeNanoseconds: "1",
		deviceId: "1",
		inode,
		mode: "16877",
		modifiedTimeNanoseconds: "1",
		ownerUid,
	};
}

export function preflightOptions({
	fixture,
	mode = "dry-run" as const,
}: {
	fixture: GuiFixture;
	mode?: "dry-run" | "execute";
}) {
	return {
		bundleManifestPath: fixture.bundleManifestPath,
		capCutAppPath: fixture.appPath,
		dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
		mode,
	};
}

export async function preflightFixture({
	fixture,
	identity = createIdentity({ homePath: fixture.canonicalHomePath }),
	mode = "dry-run" as const,
	readOwner = readOwnerUid,
	verifyBundle = fixture.verifyBundle,
}: {
	fixture: GuiFixture;
	identity?: ReturnType<typeof createIdentity>;
	mode?: "dry-run" | "execute";
	readOwner?: typeof readOwnerUid;
	verifyBundle?: CapCutGuiBundleVerifier;
}) {
	return capCutGuiRegressionPreflightTesting.preflightWithRuntime({
		options: {
			...preflightOptions({ fixture, mode }),
			...(mode === "execute"
				? { executionConfirmation: CAPCUT_GUI_EXECUTION_CONFIRMATION }
				: {}),
		},
		runtime: {
			identity,
			inspectApp: fixture.inspectApp,
			platform: "darwin",
			preflightStore: preflightDisposableCapCutStore,
			readOwner,
			verifyBundle,
		},
	});
}

export async function writeExecutionSentinel({
	fixture,
	username = "qcut-e2e",
}: {
	fixture: GuiFixture;
	username?: string;
}): Promise<void> {
	await writeJson({
		path: join(
			fixture.canonicalHomePath,
			CAPCUT_GUI_EXECUTION_SENTINEL_FILE_NAME
		),
		value: {
			canonicalHomePath: fixture.canonicalHomePath,
			canonicalStorePath: fixture.canonicalStorePath,
			purpose: CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE,
			runId: fixture.runId,
			schema: CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA,
			uid: getProcessUid(),
			username,
			version: CAPCUT_GUI_EXECUTION_SENTINEL_VERSION,
		},
	});
}

export async function cleanupGuiFixtures(): Promise<void> {
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { force: true, recursive: true })
		)
	);
}
