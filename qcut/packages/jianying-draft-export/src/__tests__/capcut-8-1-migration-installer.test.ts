import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
	stat,
	symlink,
	truncate,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCapCut81MigrationBundle } from "../capcut-8-1-migration-bundle-reader.js";
import { buildCapCut81MigrationScaffold } from "../capcut-8-1-migration-scaffold.js";
import { capCut81MigrationInstallerTesting } from "../capcut-8-1-migration-installer.js";
import { CAPCUT_8_1_INSTALL_LIMITS } from "../capcut-8-1-migration-installer-limits.js";
import { writeTrustedCapCut81MigrationBundle } from "../capcut-8-1-migration-writer.js";

const DRAFT_ID = "11111111-2222-4333-8444-555555555555";
const PLACEHOLDER_ID = "66666666-7777-4888-8999-AAAAAAAAAAAA";
const PROJECT_ID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
const TIMELINE_ID = "99999999-8888-4777-8666-555555555555";
const DRAFT_FOLDER_NAME = "QCut-install-11111111";
const STORE_DIRECTORY_NAME = "com.lveditor.draft";
const MANIFEST_FILE_NAME = "qcut-capcut-migration-manifest.json";
const LOCK_FILE_NAME = ".qcut-capcut-migration-install.lock";
const temporaryDirectories: string[] = [];
const ffprobeVersion = spawnSync("ffprobe", ["-version"], {
	encoding: "utf8",
});
const hasFfprobe8 =
	ffprobeVersion.status === 0 &&
	/^ffprobe version 8(?:\.|\s)/i.test(ffprobeVersion.stdout);

interface BundleFixture {
	assetPath: string;
	completeMarkerPath: string;
	contentPaths: string[];
	manifestPath: string;
	outputDirectory: string;
	sourceDraftDirectory: string;
}

interface TargetFixture {
	capCutAppPath: string;
	defaultAdjustBundlePath: string;
	existingEntry: Record<string, unknown>;
	originalRootBytes: Buffer;
	targetDraftStoreDirectory: string;
}

interface FixtureManifest {
	assets: Array<Record<string, unknown>>;
	generatedAssets: Array<Record<string, unknown>>;
	timelineMaterialsSize: number;
}

function createSha256({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function createTemporaryDirectory({
	prefix,
}: {
	prefix: string;
}): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return realpath(directory);
}

async function writeFixtureFile({
	bytes,
	filePath,
}: {
	bytes: Buffer | string;
	filePath: string;
}): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, bytes);
}

async function createBundleFixture({
	contentExtra = "",
	draftPathToken = `##_draftpath_placeholder_${PLACEHOLDER_ID}_##`,
}: {
	contentExtra?: string;
	draftPathToken?: string;
} = {}): Promise<BundleFixture> {
	const rootDirectory = await createTemporaryDirectory({
		prefix: "qcut-capcut-install-bundle-",
	});
	const outputDirectory = join(rootDirectory, "migration");
	const sourceDraftStoreDirectory = join(outputDirectory, STORE_DIRECTORY_NAME);
	const sourceDraftDirectory = join(
		sourceDraftStoreDirectory,
		DRAFT_FOLDER_NAME
	);
	const content = {
		extra: contentExtra,
		id: TIMELINE_ID,
		materials: {
			effects: [
				{
					lumi_hub_path: `${draftPathToken}/assets/lut/qcut-vivid.cube;##_capcut_default_adjust_bundle_##/lumi_hub_path`,
					path: `${draftPathToken}/assets/lut/qcut-vivid.cube;##_capcut_default_adjust_bundle_##`,
				},
			],
			videos: [
				{
					path: `${draftPathToken}/assets/video/source.mov`,
				},
			],
		},
	};
	const contentBytes = Buffer.from(JSON.stringify(content), "utf8");
	const videoBytes = Buffer.from("verified-video-asset");
	const lutBytes = Buffer.from("TITLE QCut Vivid\nLUT_3D_SIZE 2\n", "utf8");
	const videoRelativePath = `${STORE_DIRECTORY_NAME}/${DRAFT_FOLDER_NAME}/assets/video/source.mov`;
	const lutRelativePath = `${STORE_DIRECTORY_NAME}/${DRAFT_FOLDER_NAME}/assets/lut/qcut-vivid.cube`;
	const timelineMaterialsSize =
		contentBytes.length + videoBytes.length + lutBytes.length;
	const scaffold = buildCapCut81MigrationScaffold({
		canvasHeight: 1080,
		createdAtMicroseconds: 1_700_000_000_000_000,
		draftFolderName: DRAFT_FOLDER_NAME,
		draftId: DRAFT_ID,
		draftName: "QCut migration install",
		durationMicroseconds: 3_000_000,
		finalBundleRootPath: sourceDraftStoreDirectory,
		projectId: PROJECT_ID,
		timelineId: TIMELINE_ID,
		timelineMaterialsSize,
		updatedAtMicroseconds: 1_700_000_100_000_000,
	});
	const prefix = `${STORE_DIRECTORY_NAME}/${DRAFT_FOLDER_NAME}`;
	const timelinePrefix = `${prefix}/Timelines/${TIMELINE_ID}`;
	const contentPaths = [
		`${prefix}/draft_info.json`,
		`${prefix}/template-2.tmp`,
		`${timelinePrefix}/draft_info.json`,
		`${timelinePrefix}/template-2.tmp`,
		`${prefix}/draft_info.json.bak`,
		`${timelinePrefix}/draft_info.json.bak`,
	];
	await Promise.all([
		...contentPaths.map((relativePath) =>
			writeFixtureFile({
				bytes: contentBytes,
				filePath: join(outputDirectory, ...relativePath.split("/")),
			})
		),
		...[...scaffold.entries()].map(([relativePath, text]) =>
			writeFixtureFile({
				bytes: text,
				filePath: join(sourceDraftStoreDirectory, ...relativePath.split("/")),
			})
		),
		writeFixtureFile({
			bytes: videoBytes,
			filePath: join(outputDirectory, ...videoRelativePath.split("/")),
		}),
		writeFixtureFile({
			bytes: lutBytes,
			filePath: join(outputDirectory, ...lutRelativePath.split("/")),
		}),
	]);
	const manifest = {
		assets: [
			{
				bytes: videoBytes.length,
				relativePath: videoRelativePath,
				sha256: createSha256({ bytes: videoBytes }),
			},
		],
		content: {
			activeMirrors: contentPaths.slice(0, 4),
			backups: contentPaths.slice(4),
			bytes: contentBytes.length,
			sha256: createSha256({ bytes: contentBytes }),
		},
		durabilityWarnings: [],
		ffprobe: { major: 8, version: "8.0" },
		generatedAssets: [
			{
				bytes: lutBytes.length,
				effectMaterialId: "lut-effect",
				kind: "lut",
				relativePath: lutRelativePath,
				sha256: createSha256({ bytes: lutBytes }),
			},
		],
		generator: "QCut",
		ids: {
			draftId: DRAFT_ID,
			placeholderId: PLACEHOLDER_ID,
			projectId: PROJECT_ID,
			timelineId: TIMELINE_ID,
		},
		profile: "capcut-desktop-8.1-plaintext",
		scaffoldFiles: [...scaffold.keys()].map(
			(relativePath) => `${STORE_DIRECTORY_NAME}/${relativePath}`
		),
		schemaVersion: 1,
		storeDirectory: STORE_DIRECTORY_NAME,
		timelineMaterialsSize,
	};
	const manifestBytes = Buffer.from(
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
	const completeBytes = Buffer.from(
		`${JSON.stringify(
			{
				assetCount: 2,
				contentSha256: manifest.content.sha256,
				manifestFile: MANIFEST_FILE_NAME,
				manifestSha256: createSha256({ bytes: manifestBytes }),
				status: "complete",
				timelineMaterialsSize,
			},
			null,
			2
		)}\n`,
		"utf8"
	);
	await Promise.all([
		writeFixtureFile({
			bytes: manifestBytes,
			filePath: join(outputDirectory, MANIFEST_FILE_NAME),
		}),
		writeFixtureFile({
			bytes: completeBytes,
			filePath: join(outputDirectory, "QCUT_EXPORT_COMPLETE.json"),
		}),
	]);
	return {
		assetPath: join(outputDirectory, ...videoRelativePath.split("/")),
		completeMarkerPath: join(outputDirectory, "QCUT_EXPORT_COMPLETE.json"),
		contentPaths,
		manifestPath: join(outputDirectory, MANIFEST_FILE_NAME),
		outputDirectory,
		sourceDraftDirectory,
	};
}

async function createTargetFixture({
	appBundleIdentifier = "com.lemon.lvoverseas",
	appVersion = "8.1.1",
	duplicateDraft = false,
}: {
	appBundleIdentifier?: string;
	appVersion?: string;
	duplicateDraft?: boolean;
} = {}): Promise<TargetFixture> {
	const rootDirectory = await createTemporaryDirectory({
		prefix: "qcut-capcut-install-target-",
	});
	const targetDraftStoreDirectory = join(
		rootDirectory,
		"Projects",
		STORE_DIRECTORY_NAME
	);
	const capCutAppPath = join(rootDirectory, "Applications", "CapCut.app");
	const defaultAdjustBundlePath = join(
		capCutAppPath,
		"Contents",
		"Resources",
		"DefaultAdjustBundle",
		"merge_all_adjust_color"
	);
	await Promise.all([
		mkdir(targetDraftStoreDirectory, { recursive: true }),
		mkdir(defaultAdjustBundlePath, { recursive: true }),
		writeFixtureFile({
			bytes: [
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<plist version="1.0"><dict>',
				`<key>CFBundleIdentifier</key><string>${appBundleIdentifier}</string>`,
				`<key>CFBundleShortVersionString</key><string>${appVersion}</string>`,
				`<key>CFBundleVersion</key><string>${appVersion}</string>`,
				"</dict></plist>",
			].join("\n"),
			filePath: join(capCutAppPath, "Contents", "Info.plist"),
		}),
	]);
	const existingEntry = {
		draft_fold_path: duplicateDraft
			? join(targetDraftStoreDirectory, DRAFT_FOLDER_NAME)
			: join(targetDraftStoreDirectory, "existing-draft"),
		draft_id: duplicateDraft
			? DRAFT_ID
			: "22222222-3333-4444-8555-666666666666",
		draft_name: "Existing draft",
	};
	const originalRootBytes = Buffer.from(
		JSON.stringify({
			all_draft_store: [existingEntry],
			draft_ids: 1,
			root_path: targetDraftStoreDirectory,
		}),
		"utf8"
	);
	await writeFixtureFile({
		bytes: originalRootBytes,
		filePath: join(targetDraftStoreDirectory, "root_meta_info.json"),
	});
	return {
		capCutAppPath,
		defaultAdjustBundlePath,
		existingEntry,
		originalRootBytes,
		targetDraftStoreDirectory,
	};
}

async function rewriteFixtureManifest({
	bundle,
	mutate,
}: {
	bundle: BundleFixture;
	mutate: ({ manifest }: { manifest: FixtureManifest }) => void;
}): Promise<void> {
	const manifest = JSON.parse(
		await readFile(bundle.manifestPath, "utf8")
	) as FixtureManifest;
	mutate({ manifest });
	const manifestBytes = Buffer.from(
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
	const complete = JSON.parse(
		await readFile(bundle.completeMarkerPath, "utf8")
	) as Record<string, unknown>;
	complete.manifestSha256 = createSha256({ bytes: manifestBytes });
	complete.timelineMaterialsSize = manifest.timelineMaterialsSize;
	await Promise.all([
		writeFile(bundle.manifestPath, manifestBytes),
		writeFile(
			bundle.completeMarkerPath,
			`${JSON.stringify(complete, null, 2)}\n`
		),
	]);
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe.skipIf(process.platform !== "darwin")(
	"CapCut 8.1 migration installer",
	() => {
		it("installs one verified draft, rebinds paths, and preserves existing drafts", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const assertTargetAppClosed = vi.fn(async () => undefined);

			const result = await capCut81MigrationInstallerTesting.installForMac({
				assertTargetAppClosed,
				capCutAppPath: target.capCutAppPath,
				outputDirectory: bundle.outputDirectory,
				targetDraftStoreDirectory: target.targetDraftStoreDirectory,
			});

			const rootMeta = JSON.parse(
				await readFile(result.rootMetaInfoPath, "utf8")
			) as Record<string, unknown>;
			expect(rootMeta).toMatchObject({
				all_draft_store: [
					target.existingEntry,
					{
						draft_fold_path: result.draftDirectory,
						draft_id: DRAFT_ID,
						draft_json_file: join(result.draftDirectory, "draft_info.json"),
						draft_root_path: target.targetDraftStoreDirectory,
					},
				],
				draft_ids: 2,
				root_path: target.targetDraftStoreDirectory,
			});
			expect(await readFile(result.rootMetaInfoBackupPath)).toEqual(
				target.originalRootBytes
			);
			const installedContent = await Promise.all(
				result.contentMirrorPaths.map((filePath) => readFile(filePath, "utf8"))
			);
			expect(new Set(installedContent)).toHaveLength(1);
			expect(installedContent[0]).toContain(result.draftDirectory);
			expect(installedContent[0]).toContain(target.defaultAdjustBundlePath);
			expect(installedContent[0]).not.toContain("##_");
			expect(
				createHash("sha256")
					.update(installedContent[0] ?? "")
					.digest("hex")
			).toBe(result.installedContentSha256);
			const draftMeta = await readFile(
				join(result.draftDirectory, "draft_meta_info.json"),
				"utf8"
			);
			expect(draftMeta).toContain(result.draftDirectory);
			expect(draftMeta).toContain(target.targetDraftStoreDirectory);
			expect(
				await readFile(
					join(bundle.sourceDraftDirectory, "draft_info.json"),
					"utf8"
				)
			).toContain(`##_draftpath_placeholder_${PLACEHOLDER_ID}_##`);
			expect(await readdir(target.targetDraftStoreDirectory)).not.toContain(
				".qcut-capcut-migration-install.lock"
			);
			expect(assertTargetAppClosed).toHaveBeenCalledWith({
				capCutAppPath: target.capCutAppPath,
				targetDraftStoreDirectory: target.targetDraftStoreDirectory,
			});
			expect(assertTargetAppClosed).toHaveBeenCalledTimes(4);
		});

		it("verifies a non-empty migration bundle under the Bun runtime", async () => {
			const bundle = await createBundleFixture();
			const modulePath =
				"./packages/jianying-draft-export/src/capcut-8-1-migration-bundle-reader.ts";
			const script = [
				`import { verifyCapCut81MigrationBundle } from ${JSON.stringify(modulePath)};`,
				`const result = await verifyCapCut81MigrationBundle({ outputDirectory: ${JSON.stringify(bundle.outputDirectory)} });`,
				"console.log(JSON.stringify({ files: result.draftFiles.length, assets: result.manifest.assets.length, generated: result.manifest.generatedAssets.length }));",
			].join("\n");

			const verification = spawnSync("bun", ["-e", script], {
				cwd: process.cwd(),
				encoding: "utf8",
			});

			expect(verification.status, verification.stderr).toBe(0);
			expect(JSON.parse(verification.stdout.trim())).toEqual({
				assets: 1,
				files: 28,
				generated: 1,
			});
		});

		it("verifies and installs a bundle after it moves to another absolute path", async () => {
			const bundle = await createBundleFixture();
			const originalStoredDraftStoreDirectory = dirname(
				bundle.sourceDraftDirectory
			);
			const relocationDirectory = await createTemporaryDirectory({
				prefix: "qcut-capcut-relocated-bundle-",
			});
			const relocatedOutputDirectory = join(
				relocationDirectory,
				"renamed-migration"
			);
			await rename(bundle.outputDirectory, relocatedOutputDirectory);
			const target = await createTargetFixture();

			const verified = await verifyCapCut81MigrationBundle({
				outputDirectory: relocatedOutputDirectory,
			});
			expect(verified.sourceDraftStoreDirectory).toBe(
				join(relocatedOutputDirectory, STORE_DIRECTORY_NAME)
			);
			expect(verified.storedDraftStoreDirectory).toBe(
				originalStoredDraftStoreDirectory
			);
			expect(verified.storedDraftStoreDirectory).not.toBe(
				verified.sourceDraftStoreDirectory
			);

			const result = await capCut81MigrationInstallerTesting.installForMac({
				assertTargetAppClosed: async () => undefined,
				capCutAppPath: target.capCutAppPath,
				outputDirectory: relocatedOutputDirectory,
				targetDraftStoreDirectory: target.targetDraftStoreDirectory,
			});

			const installedDraftMeta = await readFile(
				join(result.draftDirectory, "draft_meta_info.json"),
				"utf8"
			);
			expect(installedDraftMeta).toContain(result.draftDirectory);
			expect(installedDraftMeta).toContain(target.targetDraftStoreDirectory);
			expect(installedDraftMeta).not.toContain(
				originalStoredDraftStoreDirectory
			);
		});

		it.skipIf(!hasFfprobe8)(
			"writes, renames, verifies, and installs a real generated bundle",
			async () => {
				const outputParentDirectory = await createTemporaryDirectory({
					prefix: "qcut-capcut-portable-writer-",
				});
				const written = await writeTrustedCapCut81MigrationBundle({
					createdAtUnixSeconds: 100,
					draftName: "Portable migration",
					ffprobePath: "ffprobe",
					outputParentDirectory,
					snapshot: {
						media: [],
						project: {
							backgroundColor: "transparent",
							backgroundType: "color",
							fps: 30,
							height: 1080,
							id: "portable-project",
							name: "Portable migration",
							sceneId: "portable-scene",
							width: 1920,
						},
						schemaVersion: 1,
						timelineDurationByElementId: {},
						tracks: [],
					},
					targetPlatform: "macos",
				});
				const originalStoredDraftStoreDirectory = written.draftStoreDirectory;
				const relocationDirectory = await createTemporaryDirectory({
					prefix: "qcut-capcut-portable-destination-",
				});
				const relocatedOutputDirectory = join(
					relocationDirectory,
					"relocated-generated-bundle"
				);
				await rename(written.outputDirectory, relocatedOutputDirectory);
				const verified = await verifyCapCut81MigrationBundle({
					outputDirectory: relocatedOutputDirectory,
				});
				expect(verified.storedDraftStoreDirectory).toBe(
					originalStoredDraftStoreDirectory
				);
				expect(verified.sourceDraftStoreDirectory).not.toBe(
					verified.storedDraftStoreDirectory
				);

				const target = await createTargetFixture();
				const installed = await capCut81MigrationInstallerTesting.installForMac(
					{
						assertTargetAppClosed: async () => undefined,
						capCutAppPath: target.capCutAppPath,
						outputDirectory: relocatedOutputDirectory,
						targetDraftStoreDirectory: target.targetDraftStoreDirectory,
					}
				);
				expect(
					JSON.parse(await readFile(installed.rootMetaInfoPath, "utf8"))
						.all_draft_store
				).toHaveLength(2);
				expect(
					await readFile(
						join(installed.draftDirectory, "draft_meta_info.json"),
						"utf8"
					)
				).not.toContain(originalStoredDraftStoreDirectory);
			}
		);

		it("rejects an inconsistent stored bundle-root prefix", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const rootMetaInfoPath = join(
				dirname(bundle.sourceDraftDirectory),
				"root_meta_info.json"
			);
			const rootMetaInfo = JSON.parse(
				await readFile(rootMetaInfoPath, "utf8")
			) as Record<string, unknown>;
			rootMetaInfo.root_path = join(
				dirname(String(rootMetaInfo.root_path)),
				"foreign-draft-store"
			);
			await writeFile(rootMetaInfoPath, JSON.stringify(rootMetaInfo));

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("root metadata does not match");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("rejects a stored path that crosses into another draft folder", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const sourceDraftStoreDirectory = dirname(bundle.sourceDraftDirectory);
			const rootMetaInfoPath = join(
				sourceDraftStoreDirectory,
				"root_meta_info.json"
			);
			const rootMetaInfo = JSON.parse(
				await readFile(rootMetaInfoPath, "utf8")
			) as {
				all_draft_store: Array<Record<string, unknown>>;
			};
			const rootEntry = rootMetaInfo.all_draft_store[0];
			if (!rootEntry) throw new Error("Fixture root entry is missing.");
			rootEntry.draft_fold_path = join(
				sourceDraftStoreDirectory,
				"another-draft"
			);
			await writeFile(rootMetaInfoPath, JSON.stringify(rootMetaInfo));

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("root metadata does not match");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("rejects a tampered content mirror before changing the target store", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			await writeFile(
				join(bundle.outputDirectory, ...bundle.contentPaths[0]!.split("/")),
				"tampered"
			);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("content mirrors");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
		});

		it("rejects a symlinked asset without following it", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const outsidePath = join(dirname(bundle.outputDirectory), "outside.mov");
			await writeFile(outsidePath, "verified-video-asset");
			await unlink(bundle.assetPath);
			await symlink(outsidePath, bundle.assetPath);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("regular file");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("rejects duplicate IDs or draft folders while preserving root metadata", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture({ duplicateDraft: true });

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("already contains draft");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("preserves token-like user text outside known content path fields", async () => {
			const bundle = await createBundleFixture({
				contentExtra: "##_foreign_runtime_path_##",
			});
			const target = await createTargetFixture();

			const result = await capCut81MigrationInstallerTesting.installForMac({
				assertTargetAppClosed: async () => undefined,
				capCutAppPath: target.capCutAppPath,
				outputDirectory: bundle.outputDirectory,
				targetDraftStoreDirectory: target.targetDraftStoreDirectory,
			});
			const installedContent = await readFile(
				result.contentMirrorPaths[0]!,
				"utf8"
			);
			expect(installedContent).toContain("##_foreign_runtime_path_##");
			expect(installedContent).toContain(result.draftDirectory);
			expect(installedContent).toContain(target.defaultAdjustBundlePath);
		});

		it("rejects a foreign placeholder inside a known content path field", async () => {
			const bundle = await createBundleFixture({
				draftPathToken:
					"##_draftpath_placeholder_00000000-1111-4222-8333-444444444444_##",
			});
			const target = await createTargetFixture();

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("foreign draft path token");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("detects a nanosecond-identity change before copying", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const originalBytes = await readFile(bundle.assetPath);
			const originalStats = await stat(bundle.assetPath);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
					testingHooks: {
						beforeDraftCopy: async () => {
							await writeFile(
								bundle.assetPath,
								Buffer.alloc(originalBytes.length, 0x78)
							);
							await utimes(
								bundle.assetPath,
								originalStats.atime,
								originalStats.mtime
							);
						},
					},
				})
			).rejects.toThrow("changed before copying");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it.each([
			{
				kind: "content mirror",
				relativePath: "draft_info.json",
			},
			{
				kind: "scaffold",
				relativePath: "draft_meta_info.json",
			},
			{
				kind: "asset",
				relativePath: "assets/video/source.mov",
			},
		])("rejects a $kind whose bytes change after its source handle opens", async ({
			relativePath,
		}) => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const sourcePath = join(
				bundle.sourceDraftDirectory,
				...relativePath.split("/")
			);
			const originalBytes = await readFile(sourcePath);
			const originalStats = await stat(sourcePath);
			let injected = false;

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
					testingHooks: {
						beforeDraftFileCopy: async ({
							relativePath: copyingRelativePath,
						}) => {
							if (copyingRelativePath !== relativePath || injected) return;
							injected = true;
							await writeFile(
								sourcePath,
								Buffer.alloc(originalBytes.length, 0x78)
							);
							await utimes(
								sourcePath,
								originalStats.atime,
								originalStats.mtime
							);
						},
					},
				})
			).rejects.toThrow("source content changed while copying");
			expect(injected).toBe(true);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("fails with actionable recovery details for a stale install lock", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const orphanStagingDirectory = join(
				target.targetDraftStoreDirectory,
				".qcut-install-orphan.staging"
			);
			const lockPath = join(target.targetDraftStoreDirectory, LOCK_FILE_NAME);
			await mkdir(orphanStagingDirectory);
			await writeFile(
				lockPath,
				JSON.stringify({
					nonce: "stale-nonce",
					pid: 999_999,
					stagingDirectory: orphanStagingDirectory,
					startedAt: "2026-01-01T00:00:00.000Z",
				})
			);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("confirm the recorded process is no longer running");
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual(
				[
					LOCK_FILE_NAME,
					".qcut-install-orphan.staging",
					"root_meta_info.json",
				].sort()
			);
			expect(await readFile(lockPath, "utf8")).toContain(
				orphanStagingDirectory
			);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("runs the main-owned app guard before creating installation state", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => {
						throw new Error("CapCut is still running.");
					},
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("still running");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
		});

		it("runs the app-closed guard again immediately before publishing", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			let guardCalls = 0;

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => {
						guardCalls += 1;
						if (guardCalls === 2) {
							throw new Error("CapCut restarted during install.");
						}
					},
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("restarted during install");
			expect(guardCalls).toBe(2);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
		});

		it("rechecks the app guard immediately before the draft-directory rename", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			let guardCalls = 0;

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => {
						guardCalls += 1;
						if (guardCalls === 3) {
							throw new Error("CapCut restarted before draft publication.");
						}
					},
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("restarted before draft publication");
			expect(guardCalls).toBe(3);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("rechecks the app guard immediately before root metadata replacement", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			let guardCalls = 0;

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => {
						guardCalls += 1;
						if (guardCalls === 4) {
							throw new Error("CapCut restarted before root registration.");
						}
					},
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("restarted before root registration");
			expect(guardCalls).toBe(4);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("preserves concurrent root metadata changes after atomic draft publication", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const externalRootBytes = Buffer.from(
				JSON.stringify({
					all_draft_store: [target.existingEntry],
					draft_ids: 1,
					external_revision: 2,
					root_path: target.targetDraftStoreDirectory,
				}),
				"utf8"
			);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
					testingHooks: {
						afterDraftPublished: async () => {
							await writeFile(
								join(target.targetDraftStoreDirectory, "root_meta_info.json"),
								externalRootBytes
							);
						},
					},
				})
			).rejects.toThrow("root metadata changed");
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(externalRootBytes);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
		});

		it("rejects a non-official application bundle identifier", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture({
				appBundleIdentifier: "com.example.fake-capcut",
			});

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("not the official CapCut");
		});

		it("rejects CapCut versions outside the verified 8.1.x profile", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture({ appVersion: "8.2.0" });

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("requires an 8.1.x");
		});

		it("rolls back an atomically published draft when the pre-registration window fails", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const targetDraftDirectory = join(
				target.targetDraftStoreDirectory,
				DRAFT_FOLDER_NAME
			);
			let observedPublishedTree = false;

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
					testingHooks: {
						afterDraftPublished: async () => {
							observedPublishedTree = true;
							expect(
								await readFile(
									join(targetDraftDirectory, "draft_info.json"),
									"utf8"
								)
							).not.toContain("##_");
							expect(
								await readFile(
									join(target.targetDraftStoreDirectory, "root_meta_info.json")
								)
							).toEqual(target.originalRootBytes);
							throw new Error("simulated crash window");
						},
					},
				})
			).rejects.toThrow("simulated crash window");
			expect(observedPublishedTree).toBe(true);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
			expect(await readdir(target.targetDraftStoreDirectory)).toEqual([
				"root_meta_info.json",
			]);
		});

		it("does not replace an unregistered conflicting destination folder", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const conflictingDirectory = join(
				target.targetDraftStoreDirectory,
				DRAFT_FOLDER_NAME
			);
			await mkdir(conflictingDirectory);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("already exists");
			expect(await readdir(conflictingDirectory)).toEqual([]);
			expect(
				await readFile(
					join(target.targetDraftStoreDirectory, "root_meta_info.json")
				)
			).toEqual(target.originalRootBytes);
		});

		it("rejects a manifest larger than the hard metadata limit", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			await writeFile(
				bundle.manifestPath,
				Buffer.alloc(CAPCUT_8_1_INSTALL_LIMITS.manifestBytes + 1, 0x20)
			);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("exceeds the supported size");
		});

		it("rejects an asset list larger than the bounded validation queue", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			await rewriteFixtureManifest({
				bundle,
				mutate: ({ manifest }) => {
					const template = manifest.assets[0];
					expect(template).toBeDefined();
					manifest.assets = Array.from(
						{ length: CAPCUT_8_1_INSTALL_LIMITS.assetCount + 1 },
						() => ({ ...template })
					);
				},
			});

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("asset-count limit");
		});

		it("rejects a draft tree deeper than the recursive traversal limit", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const nestedPath = Array.from(
				{ length: CAPCUT_8_1_INSTALL_LIMITS.directoryDepth + 1 },
				(_, index) => `depth-${index}`
			);
			await mkdir(join(bundle.sourceDraftDirectory, ...nestedPath), {
				recursive: true,
			});

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("directory-depth limit");
		});

		it("rejects a sparse draft tree beyond the total-byte limit", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			const sparsePath = join(bundle.sourceDraftDirectory, "oversized.sparse");
			await writeFile(sparsePath, "");
			await truncate(sparsePath, CAPCUT_8_1_INSTALL_LIMITS.treeTotalBytes + 1);

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("total-byte limit");
		});

		it("rejects declared timeline material bytes beyond the install ceiling", async () => {
			const bundle = await createBundleFixture();
			const target = await createTargetFixture();
			await rewriteFixtureManifest({
				bundle,
				mutate: ({ manifest }) => {
					manifest.timelineMaterialsSize =
						CAPCUT_8_1_INSTALL_LIMITS.timelineMaterialsBytes + 1;
				},
			});

			await expect(
				capCut81MigrationInstallerTesting.installForMac({
					assertTargetAppClosed: async () => undefined,
					capCutAppPath: target.capCutAppPath,
					outputDirectory: bundle.outputDirectory,
					targetDraftStoreDirectory: target.targetDraftStoreDirectory,
				})
			).rejects.toThrow("timeline materials exceed");
		});
	}
);
