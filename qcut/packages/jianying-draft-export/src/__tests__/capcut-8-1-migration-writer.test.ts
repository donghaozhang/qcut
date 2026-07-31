import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import type {
	QCutDraftExportImageMedia,
	QCutDraftExportSnapshotV1,
	QCutDraftExportVideoMedia,
} from "@qcut/editor-core/jianying-draft";
import type { MediaColorSettings } from "@qcut/editor-core/types";
import ffprobeStatic from "ffprobe-static";
import { afterEach, describe, expect, it } from "vitest";
import { writeTrustedCapCut81MigrationBundle } from "../capcut-8-1-migration-writer.js";
import { createJianyingDraftIssueFingerprint } from "../writer.js";

const VALID_PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	"base64"
);
const ffprobeVersion = spawnSync("ffprobe", ["-version"], {
	encoding: "utf8",
});
const hasFfprobe8 =
	ffprobeVersion.status === 0 &&
	/^ffprobe version 8(?:\.|\s)/i.test(ffprobeVersion.stdout);
const hasFfmpeg =
	spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-capcut-writer-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createEmptySnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "CapCut migration",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [],
	};
}

function createImageSnapshot({
	sourcePath,
}: {
	sourcePath: string;
}): QCutDraftExportSnapshotV1 {
	const media: QCutDraftExportImageMedia = {
		height: 1,
		id: "image",
		name: basename(sourcePath),
		sourcePath,
		type: "image",
		width: 1,
	};
	return {
		...createEmptySnapshot(),
		media: [media],
		project: {
			...createEmptySnapshot().project,
			height: 1,
			width: 1,
		},
		timelineDurationByElementId: { clip: 1 },
		tracks: [
			{
				elements: [
					{
						duration: 1,
						id: "clip",
						mediaId: media.id,
						name: media.name,
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				id: "track",
				name: "Main",
				type: "media",
			},
		],
	};
}

function createVideoSnapshot({
	sourcePath,
}: {
	sourcePath: string;
}): QCutDraftExportSnapshotV1 {
	const media: QCutDraftExportVideoMedia = {
		duration: 1,
		height: 180,
		id: "video",
		name: basename(sourcePath),
		sourcePath,
		type: "video",
		width: 320,
	};
	const snapshot = createImageSnapshot({ sourcePath });
	snapshot.media = [media];
	snapshot.project.height = 180;
	snapshot.project.width = 320;
	const element = snapshot.tracks[0]?.elements[0];
	if (!element || element.type !== "media") {
		throw new Error("Video fixture is missing its media element.");
	}
	element.mediaId = media.id;
	return snapshot;
}

function createPureLutColor(): MediaColorSettings {
	const range = { hue: 0, luminance: 0, saturation: 0 };
	const curve = { points: [], samples: [] };
	const wheel = { luminance: 0, x: 0, y: 0 };
	return {
		basic: {
			blacks: 0,
			brightness: 0,
			contrast: 0,
			enabled: false,
			exposure: 0,
			fade: 0,
			grain: 0,
			highlights: 0,
			saturation: 0,
			shadows: 0,
			sharpness: 0,
			temperature: 0,
			tint: 0,
			vibrance: 0,
			vignette: 0,
			whites: 0,
		},
		curves: {
			blue: [],
			enabled: false,
			green: [],
			master: [],
			mix: 100,
			red: [],
		},
		enabled: true,
		filter: { intensity: 0, presetId: "none", presetVersion: 1 },
		hsl: {
			enabled: false,
			ranges: {
				blue: range,
				cyan: range,
				green: range,
				magenta: range,
				orange: range,
				purple: range,
				red: range,
				yellow: range,
			},
		},
		keyframes: {},
		lut: {
			cube: {
				domainMax: [1, 1, 1],
				domainMin: [0, 0, 0],
				size: 2,
				values: [
					0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1,
					1,
				],
			},
			enabled: true,
			intensity: 80,
			name: "QCut writer LUT",
			presetId: "writer-lut",
			skinProtection: 0,
		},
		management: {
			enabled: false,
			inputSpace: "auto",
			outputSpace: "rec709",
			peakNits: 100,
			toneMapping: "aces",
			workingSpace: "rec709-linear",
		},
		mask: { enabled: false, invert: false, maskIds: [] },
		secondaryCurves: {
			enabled: false,
			hueVsHue: curve,
			hueVsLuminance: curve,
			hueVsSaturation: curve,
			luminanceVsSaturation: curve,
			mix: 100,
			saturationVsSaturation: curve,
		},
		smart: {
			autoTone: true,
			autoWhiteBalance: true,
			enabled: false,
			intensity: 100,
			status: "idle",
		},
		wheels: {
			balance: 0,
			enabled: false,
			highlights: wheel,
			midtones: wheel,
			mode: "tonal",
			offset: wheel,
			shadows: wheel,
			strength: 100,
		},
	};
}

function addExactMaskAndLut({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): void {
	const element = snapshot.tracks[0]?.elements[0];
	if (!element || element.type !== "media") {
		throw new Error("Feature fixture is missing its media element.");
	}
	element.color = createPureLutColor();
	element.mask = {
		blendMode: "add",
		centerX: 0.6,
		centerY: 0.55,
		enabled: true,
		expansion: 0,
		feather: 0,
		height: 0.5,
		id: "writer-mask",
		invert: false,
		name: "QCut proof mask",
		opacity: 1,
		rotation: 15,
		roundness: 0,
		stroke: {
			color: "#ffffff",
			glow: 0,
			offsetX: 0,
			offsetY: 0,
			opacity: 1,
			style: "none",
			width: 0,
		},
		type: "rectangle",
		width: 0.4,
	};
}

async function listFiles({
	directory,
	rootDirectory = directory,
}: {
	directory: string;
	rootDirectory?: string;
}): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				return listFiles({ directory: path, rootDirectory });
			}
			return [relative(rootDirectory, path).replaceAll("\\", "/")];
		})
	);
	return nested.flat().sort();
}

function expectedScaffoldPaths({
	draftFolderName,
	timelineId,
}: {
	draftFolderName: string;
	timelineId: string;
}): string[] {
	const draft = `com.lveditor.draft/${draftFolderName}`;
	const timeline = `${draft}/Timelines/${timelineId}`;
	return [
		"com.lveditor.draft/root_meta_info.json",
		`${draft}/attachment_editing.json`,
		`${draft}/attachment_pc_common.json`,
		`${draft}/common_attachment/attachment_action_scene.json`,
		`${draft}/common_attachment/attachment_gen_ai_info.json`,
		`${draft}/common_attachment/attachment_pc_timeline.json`,
		`${draft}/common_attachment/attachment_script_video.json`,
		`${draft}/draft_agency_config.json`,
		`${draft}/draft_biz_config.json`,
		`${draft}/draft_meta_info.json`,
		`${draft}/draft_settings`,
		`${draft}/performance_opt_info.json`,
		`${draft}/timeline_layout.json`,
		`${draft}/Timelines/project.json`,
		`${draft}/Timelines/project.json.bak`,
		`${timeline}/attachment_editing.json`,
		`${timeline}/attachment_pc_common.json`,
		`${timeline}/common_attachment/attachment_action_scene.json`,
		`${timeline}/common_attachment/attachment_gen_ai_info.json`,
		`${timeline}/common_attachment/attachment_pc_timeline.json`,
		`${timeline}/common_attachment/attachment_script_video.json`,
	];
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("CapCut 8.1 migration bundle writer", () => {
	it("rejects FFprobe versions other than major 8 before allocating output", async () => {
		const outputParentDirectory = await createTemporaryDirectory();

		await expect(
			writeTrustedCapCut81MigrationBundle({
				draftName: "Wrong probe",
				ffprobePath: ffprobeStatic.path,
				outputParentDirectory,
				snapshot: createEmptySnapshot(),
				targetPlatform: "macos",
			})
		).rejects.toThrow("requires FFprobe major 8");
		expect(await readdir(outputParentDirectory)).toEqual([]);
	});

	it.skipIf(!hasFfprobe8)(
		"publishes the exact migration tree with identical content mirrors",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const result = await writeTrustedCapCut81MigrationBundle({
				createdAtUnixSeconds: 100,
				draftName: "Exact migration",
				ffprobePath: "ffprobe",
				outputParentDirectory,
				snapshot: createEmptySnapshot(),
				targetPlatform: "macos",
			});
			const draft = `com.lveditor.draft/${result.draftFolderName}`;
			const timeline = `${draft}/Timelines/${result.ids.timelineId}`;
			const contentPaths = [
				`${draft}/draft_info.json`,
				`${draft}/template-2.tmp`,
				`${timeline}/draft_info.json`,
				`${timeline}/template-2.tmp`,
				`${draft}/draft_info.json.bak`,
				`${timeline}/draft_info.json.bak`,
			];
			const expectedFiles = [
				"QCUT_EXPORT_COMPLETE.json",
				"qcut-capcut-migration-manifest.json",
				...expectedScaffoldPaths({
					draftFolderName: result.draftFolderName,
					timelineId: result.ids.timelineId,
				}),
				...contentPaths,
			].sort();

			expect(await listFiles({ directory: result.outputDirectory })).toEqual(
				expectedFiles
			);
			const contentBuffers = await Promise.all(
				[...result.contentMirrorPaths, ...result.contentBackupPaths].map(
					(path) => readFile(path)
				)
			);
			expect(
				contentBuffers.every((bytes) =>
					bytes.equals(contentBuffers[0] ?? Buffer.alloc(0))
				)
			).toBe(true);
			const contentSha256 = createHash("sha256")
				.update(contentBuffers[0] ?? Buffer.alloc(0))
				.digest("hex");
			expect(contentSha256).toBe(result.contentSha256);
			expect(result.timelineMaterialsSize).toBe(contentBuffers[0]?.length);
			expect(result.content.name).toBe("Exact migration");

			const rootMeta = JSON.parse(
				await readFile(
					join(result.draftStoreDirectory, "root_meta_info.json"),
					"utf8"
				)
			);
			expect(rootMeta.root_path).toBe(result.draftStoreDirectory);
			expect(JSON.stringify(rootMeta)).not.toContain(".staging");
			expect(rootMeta.all_draft_store).toEqual([
				expect.objectContaining({
					draft_fold_path: result.draftDirectory,
					draft_json_file: join(result.draftDirectory, "draft_info.json"),
					draft_timeline_materials_size: result.timelineMaterialsSize,
				}),
			]);
			const draftMeta = JSON.parse(
				await readFile(
					join(result.draftDirectory, "draft_meta_info.json"),
					"utf8"
				)
			);
			expect(draftMeta.draft_timeline_materials_size_).toBe(
				result.timelineMaterialsSize
			);
			const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
			expect(manifest).toMatchObject({
				content: {
					activeMirrors: contentPaths.slice(0, 4),
					backups: contentPaths.slice(4),
					bytes: contentBuffers[0]?.length,
					sha256: result.contentSha256,
				},
				ffprobe: { major: 8 },
				ids: result.ids,
				timelineMaterialsSize: result.timelineMaterialsSize,
			});
			const manifestBytes = await readFile(result.manifestPath);
			const completeMarker = JSON.parse(
				await readFile(result.completeMarkerPath, "utf8")
			);
			expect(completeMarker).toMatchObject({
				manifestSha256: createHash("sha256")
					.update(manifestBytes)
					.digest("hex"),
				status: "complete",
				timelineMaterialsSize: result.timelineMaterialsSize,
			});
			expect(result.scaffoldPaths).toHaveLength(21);
			expect(
				(await readdir(outputParentDirectory)).some((name) =>
					name.endsWith(".staging")
				)
			).toBe(false);
		}
	);

	it.skipIf(!hasFfprobe8)(
		"moves verified PNG assets under placeholder paths without source leakage",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const sourcePath = join(outputParentDirectory, "private-source.png");
			await writeFile(sourcePath, VALID_PNG_BYTES);
			const result = await writeTrustedCapCut81MigrationBundle({
				draftName: "PNG migration",
				ffprobePath: "ffprobe",
				outputParentDirectory,
				snapshot: createImageSnapshot({ sourcePath }),
				targetPlatform: "macos",
			});

			const material = result.content.materials.videos[0];
			expect(material?.path).toMatch(
				new RegExp(
					`^##_draftpath_placeholder_${result.ids.placeholderId}_##/assets/image/`
				)
			);
			const copiedAsset = result.copiedAssets[0];
			expect(copiedAsset).toBeDefined();
			const destinationPath = join(
				result.draftDirectory,
				...(copiedAsset?.relativePath.split("/") ?? [])
			);
			expect(await readFile(destinationPath)).toEqual(VALID_PNG_BYTES);
			expect(result.timelineMaterialsSize).toBe(
				Buffer.byteLength(JSON.stringify(result.content), "utf8") +
					VALID_PNG_BYTES.length
			);
			const persistedText = (
				await Promise.all(
					[
						...result.contentMirrorPaths,
						...result.contentBackupPaths,
						...result.scaffoldPaths,
						result.manifestPath,
						result.completeMarkerPath,
					].map((path) => readFile(path, "utf8"))
				)
			).join("\n");
			expect(persistedText).not.toContain(sourcePath);
			expect(persistedText).not.toContain(".staging");
			expect(result.content.platform).toMatchObject({
				device_id: "",
				hard_disk_id: "",
				mac_address: "",
				os_version: "",
			});
		}
	);

	it.skipIf(!hasFfprobe8)(
		"writes generated LUT assets and mask references into the published bundle",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const sourcePath = join(outputParentDirectory, "feature-source.png");
			await writeFile(sourcePath, VALID_PNG_BYTES);
			const snapshot = createImageSnapshot({ sourcePath });
			addExactMaskAndLut({ snapshot });
			const acceptedWarningFingerprints = [
				createJianyingDraftIssueFingerprint({
					issue: {
						code: "UNEXPORTED_MASK_NAME",
						elementId: "clip",
						mediaId: "image",
						message:
							"CapCut 8.1 uses the built-in Rectangle or Circle material name, so the custom QCut mask name is not preserved.",
						severity: "warning",
						trackId: "track",
					},
				}),
			];

			const result = await writeTrustedCapCut81MigrationBundle({
				acceptedWarningFingerprints,
				draftName: "LUT and mask migration",
				ffprobePath: "ffprobe",
				outputParentDirectory,
				snapshot,
				targetPlatform: "macos",
			});

			expect(result.generatedAssets).toHaveLength(1);
			const generated = result.generatedAssets[0]!;
			const generatedPath = join(
				result.draftDirectory,
				...generated.relativePath.split("/")
			);
			const generatedBytes = await readFile(generatedPath);
			expect(generatedBytes.toString("utf8")).toContain("LUT_3D_SIZE 2");
			expect(createHash("sha256").update(generatedBytes).digest("hex")).toBe(
				generated.sha256
			);
			expect(result.content.materials.common_mask).toHaveLength(1);
			expect(result.content.materials.effects).toContainEqual(
				expect.objectContaining({ source_platform: 0, type: "lut", value: 0.8 })
			);
			expect(result.content.tracks).toContainEqual(
				expect.objectContaining({ type: "adjust" })
			);
			expect(result.timelineMaterialsSize).toBe(
				Buffer.byteLength(JSON.stringify(result.content), "utf8") +
					VALID_PNG_BYTES.length +
					generated.bytes
			);

			const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
			expect(manifest.generatedAssets).toEqual([
				expect.objectContaining({
					bytes: generated.bytes,
					effectMaterialId: generated.effectMaterialId,
					sha256: generated.sha256,
				}),
			]);
			const complete = JSON.parse(
				await readFile(result.completeMarkerPath, "utf8")
			);
			expect(complete.assetCount).toBe(2);
			const persistedContent = await readFile(
				result.contentMirrorPaths[0],
				"utf8"
			);
			expect(persistedContent).not.toMatch(/\/Users\/|\/Applications\//);
		}
	);

	it.skipIf(!hasFfprobe8)(
		"cleans the outer staging tree after asset probe failure",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const sourcePath = join(outputParentDirectory, "invalid.png");
			await writeFile(sourcePath, "not an image");

			await expect(
				writeTrustedCapCut81MigrationBundle({
					draftName: "Failed migration",
					ffprobePath: "ffprobe",
					outputParentDirectory,
					snapshot: createImageSnapshot({ sourcePath }),
					targetPlatform: "macos",
				})
			).rejects.toThrow("FFprobe");
			expect(await readdir(outputParentDirectory)).toEqual(["invalid.png"]);
		}
	);

	it.skipIf(!hasFfprobe8)(
		"allocates unique final bundles for concurrent writes",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const options = {
				draftName: "Concurrent",
				ffprobePath: "ffprobe",
				outputParentDirectory,
				snapshot: createEmptySnapshot(),
				targetPlatform: "macos" as const,
			};
			const [first, second] = await Promise.all([
				writeTrustedCapCut81MigrationBundle(options),
				writeTrustedCapCut81MigrationBundle(options),
			]);

			expect(first.outputDirectory).not.toBe(second.outputDirectory);
			expect((await stat(first.completeMarkerPath)).isFile()).toBe(true);
			expect((await stat(second.completeMarkerPath)).isFile()).toBe(true);
		}
	);

	it.skipIf(!(hasFfprobe8 && hasFfmpeg))(
		"writes a real MP4 with matching probe metadata",
		async () => {
			const outputParentDirectory = await createTemporaryDirectory();
			const sourcePath = join(outputParentDirectory, "source.mp4");
			const generation = spawnSync(
				"ffmpeg",
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=size=320x180:rate=30:duration=1",
					"-c:v",
					"mpeg4",
					"-pix_fmt",
					"yuv420p",
					sourcePath,
				],
				{ encoding: "utf8" }
			);
			expect(generation.status, generation.stderr).toBe(0);

			const result = await writeTrustedCapCut81MigrationBundle({
				draftName: "MP4 migration",
				ffprobePath: "ffprobe",
				outputParentDirectory,
				snapshot: createVideoSnapshot({ sourcePath }),
				targetPlatform: "macos",
			});
			expect(result.copiedAssets[0]?.probe).toMatchObject({
				durationSeconds: 1,
				streams: [
					expect.objectContaining({
						codecType: "video",
						height: 180,
						width: 320,
					}),
				],
			});
		},
		30_000
	);
});
