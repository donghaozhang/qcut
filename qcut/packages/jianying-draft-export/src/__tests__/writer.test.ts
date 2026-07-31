import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	lstat,
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
	QCutDraftExportSnapshotV1,
	QCutDraftExportImageMedia,
	QCutDraftExportVideoMedia,
} from "@qcut/editor-core/jianying-draft";
import ffprobeStatic from "ffprobe-static";
import { afterEach, describe, expect, it } from "vitest";
import {
	createJianyingDraftIssueFingerprint,
	type StandaloneJianyingDraftWriteResult,
	validateStandaloneAssetRelativePath,
	type WriteStandaloneJianyingDraftOptions,
	writeStandaloneJianyingDraft as writeStandaloneJianyingDraftWithExplicitFfprobe,
} from "../writer.js";
import { buildJianyingDraft } from "@qcut/editor-core/jianying-draft";

const temporaryDirectories: string[] = [];
const VALID_PNG_BYTES = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	"base64"
);
const hasFfmpeg =
	spawnSync("ffmpeg", ["-version"], {
		stdio: "ignore",
	}).status === 0;

function writeStandaloneJianyingDraft({
	ffprobePath = ffprobeStatic.path,
	...options
}: Omit<WriteStandaloneJianyingDraftOptions, "ffprobePath"> & {
	ffprobePath?: string;
}): Promise<StandaloneJianyingDraftWriteResult> {
	return writeStandaloneJianyingDraftWithExplicitFfprobe({
		...options,
		ffprobePath,
	});
}

async function createTemporaryDirectory({
	prefix,
}: {
	prefix: string;
}): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return directory;
}

function createSnapshot({
	duration = 4,
	height = 1,
	sourcePath,
	width = 1,
}: {
	duration?: number;
	height?: number;
	sourcePath: string;
	width?: number;
}): QCutDraftExportSnapshotV1 {
	const media: QCutDraftExportImageMedia = {
		height,
		id: "image-proof",
		name: basename(sourcePath),
		sourcePath,
		type: "image",
		width,
	};
	return {
		media: [media],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height,
			id: "project-proof",
			name: "QCut JianYing Proof",
			sceneId: "scene-proof",
			width,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { "clip-proof": duration },
		tracks: [
			{
				elements: [
					{
						duration,
						id: "clip-proof",
						mediaId: media.id,
						name: media.name,
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
					},
				],
				hidden: false,
				id: "track-proof",
				muted: false,
				name: "Proof track",
				order: 0,
				type: "media",
			},
		],
	};
}

function createVideoSnapshot({
	duration,
	height,
	sourcePath,
	width,
}: {
	duration: number;
	height: number;
	sourcePath: string;
	width: number;
}): QCutDraftExportSnapshotV1 {
	const snapshot = createSnapshot({
		duration,
		height,
		sourcePath,
		width,
	});
	const media: QCutDraftExportVideoMedia = {
		duration,
		height,
		id: "video-proof",
		name: basename(sourcePath),
		sourcePath,
		type: "video",
		width,
	};
	snapshot.media = [media];
	const element = snapshot.tracks[0]?.elements[0];
	if (element?.type === "media") {
		element.mediaId = media.id;
	}
	return snapshot;
}

async function writeValidPng({
	filePath,
}: {
	filePath: string;
}): Promise<void> {
	await writeFile(filePath, VALID_PNG_BYTES);
}

afterEach(async () => {
	const removals = temporaryDirectories
		.splice(0)
		.map((directory) => rm(directory, { force: true, recursive: true }));
	await Promise.all(removals);
});

describe("standalone JianYing draft writer", () => {
	it("requires the caller to select FFprobe explicitly", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-no-probe-",
		});

		await expect(
			writeStandaloneJianyingDraftWithExplicitFfprobe({
				draftName: "Missing probe",
				ffprobePath: undefined as unknown as string,
				outputParentDirectory: parentDirectory,
				snapshot: createSnapshot({
					sourcePath: join(parentDirectory, "missing.png"),
				}),
				targetPlatform: "macos",
			})
		).rejects.toThrow("requires a non-empty FFprobe path");
		expect(await readdir(parentDirectory)).toEqual([]);
	});

	it("writes a unique complete draft with copied assets", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-writer-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });

		const result = await writeStandaloneJianyingDraft({
			createdAtUnixSeconds: 100,
			draftName: "Interop / Proof",
			outputParentDirectory: parentDirectory,
			snapshot: createSnapshot({ sourcePath }),
			targetPlatform: "macos",
		});

		expect(await realpath(result.outputDirectory)).toBe(result.outputDirectory);
		expect(basename(result.contentPath)).toBe("draft_content.json");
		expect(result.buildResult.compatibility).toMatchObject({
			contentFileName: "draft_content.json",
			contentFileNameEvidence: "plaintext-5.9-reference",
			registeredWithApp: false,
			verifiedWithInstalledApp: false,
		});
		expect(result.copiedAssets).toHaveLength(1);
		const copiedPath = join(
			result.outputDirectory,
			...result.copiedAssets[0].relativePath.split("/")
		);
		expect(await readFile(copiedPath)).toEqual(VALID_PNG_BYTES);
		const expectedSha256 = createHash("sha256")
			.update(VALID_PNG_BYTES)
			.digest("hex");
		expect(result.copiedAssets[0]).toMatchObject({
			bytes: VALID_PNG_BYTES.length,
			mediaId: "image-proof",
			probe: {
				formatName: "png_pipe",
				streams: [
					{
						codecName: "png",
						codecType: "video",
						height: 1,
						width: 1,
					},
				],
			},
			sha256: expectedSha256,
			type: "image",
		});
		const manifestBytes = await readFile(result.manifestPath);
		const manifest = JSON.parse(manifestBytes.toString("utf8"));
		expect(manifest).toMatchObject({
			assets: [
				{
					sha256: expectedSha256,
					type: "image",
				},
			],
			contentFile: "draft_content.json",
			schemaVersion: 2,
		});
		expect(
			JSON.parse(await readFile(result.completeMarkerPath, "utf8"))
		).toEqual({
			assetCount: 1,
			contentFile: "draft_content.json",
			manifestFile: "qcut-export-manifest.json",
			manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
			status: "complete",
		});
		const content = JSON.parse(await readFile(result.contentPath, "utf8"));
		expect(content.materials.videos[0].path).toBe(copiedPath);
		expect(result.durability).toMatch(/^(best-effort|fsync-complete)$/);
		expect(
			(await readdir(parentDirectory)).some((name) => name.endsWith(".staging"))
		).toBe(false);
	});

	it("does not create output for a blocked snapshot", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-blocked-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });
		const snapshot = createSnapshot({ sourcePath });
		snapshot.timelineDurationByElementId = {};
		const before = await readdir(parentDirectory);

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Blocked",
				outputParentDirectory: parentDirectory,
				snapshot,
				targetPlatform: "macos",
			})
		).rejects.toThrow("MISSING_TIMELINE_DURATION");
		expect(await readdir(parentDirectory)).toEqual(before);
	});

	it("requires exact acceptance for lossy warnings", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-warning-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });
		const snapshot = createSnapshot({ sourcePath });
		const element = snapshot.tracks[0]?.elements[0];
		if (!element) throw new Error("Warning fixture is missing its element.");
		element.groupId = "linked-edit";

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Warning",
				outputParentDirectory: parentDirectory,
				snapshot,
				targetPlatform: "macos",
			})
		).rejects.toThrow("requires exact warning acceptance");
		const preflight = buildJianyingDraft({
			draftOutputDirectory: join(parentDirectory, "pending"),
			snapshot,
			targetPlatform: "macos",
		});
		const acceptedWarningFingerprints = preflight.issues
			.filter(({ severity }) => severity === "warning")
			.map((issue) => createJianyingDraftIssueFingerprint({ issue }));
		const result = await writeStandaloneJianyingDraft({
			acceptedWarningFingerprints,
			draftName: "Warning",
			outputParentDirectory: parentDirectory,
			snapshot,
			targetPlatform: "macos",
		});

		expect(result.buildResult.issues).toContainEqual(
			expect.objectContaining({ code: "UNSUPPORTED_MEDIA_FEATURE" })
		);
	});

	it("uses stable exact warning acceptance for unexported media-bin assets", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-unused-media-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });
		const snapshot = createSnapshot({ sourcePath });
		const unusedMedia: QCutDraftExportImageMedia = {
			height: 1,
			id: "unused-bin-image",
			name: "unused.png",
			sourcePath: join(parentDirectory, "unused-not-copied.png"),
			type: "image",
			width: 1,
		};
		snapshot.media = [unusedMedia, ...snapshot.media];

		const firstPreflight = buildJianyingDraft({
			draftOutputDirectory: join(parentDirectory, "first-pending"),
			snapshot,
			targetPlatform: "macos",
		});
		const secondPreflight = buildJianyingDraft({
			draftOutputDirectory: join(parentDirectory, "second-pending"),
			snapshot: {
				...snapshot,
				media: [...snapshot.media].reverse(),
			},
			targetPlatform: "macos",
		});
		const firstWarningFingerprints = firstPreflight.issues
			.filter(({ severity }) => severity === "warning")
			.map((issue) => createJianyingDraftIssueFingerprint({ issue }));
		const secondWarningFingerprints = secondPreflight.issues
			.filter(({ severity }) => severity === "warning")
			.map((issue) => createJianyingDraftIssueFingerprint({ issue }));

		expect(firstPreflight.issues).toContainEqual({
			code: "UNEXPORTED_MEDIA_BIN_ASSET",
			mediaId: unusedMedia.id,
			message:
				"Media unused-bin-image is not referenced by a timeline media or sticker element, so its media-bin asset will not be copied into the target draft.",
			severity: "warning",
		});
		expect(firstWarningFingerprints).toEqual(secondWarningFingerprints);
		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Unused media warning",
				outputParentDirectory: parentDirectory,
				snapshot,
				targetPlatform: "macos",
			})
		).rejects.toThrow("requires exact warning acceptance");

		const result = await writeStandaloneJianyingDraft({
			acceptedWarningFingerprints: firstWarningFingerprints,
			draftName: "Unused media warning",
			outputParentDirectory: parentDirectory,
			snapshot,
			targetPlatform: "macos",
		});

		expect(result.copiedAssets.map(({ mediaId }) => mediaId)).toEqual([
			"image-proof",
		]);
	});

	it("cleans up a partial export when the source is missing", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-missing-",
		});
		const snapshot = createSnapshot({
			sourcePath: join(parentDirectory, "missing.mp4"),
		});

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Missing",
				outputParentDirectory: parentDirectory,
				snapshot,
				targetPlatform: "macos",
			})
		).rejects.toThrow();
		expect(await readdir(parentDirectory)).toEqual([]);
	});

	it("rejects unprobeable bytes and removes hidden staging output", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-invalid-media-",
		});
		const sourcePath = join(parentDirectory, "invalid.png");
		await writeFile(sourcePath, "not media");

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Invalid media",
				outputParentDirectory: parentDirectory,
				snapshot: createSnapshot({ sourcePath }),
				targetPlatform: "macos",
			})
		).rejects.toThrow("FFprobe");
		expect(await readdir(parentDirectory)).toEqual(["invalid.png"]);
	});

	it("rejects snapshot dimensions that do not match probed pixels", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-dimension-mismatch-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Wrong dimensions",
				outputParentDirectory: parentDirectory,
				snapshot: createSnapshot({
					height: 2,
					sourcePath,
					width: 2,
				}),
				targetPlatform: "macos",
			})
		).rejects.toThrow("dimensions do not match snapshot");
		expect(await readdir(parentDirectory)).toEqual(["source.png"]);
	});

	it("resolves symlink assets to regular files", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-symlink-",
		});
		const externalMediaDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-external-media-",
		});
		const realSource = join(externalMediaDirectory, "real.png");
		const sourcePath = join(parentDirectory, "linked.png");
		await writeValidPng({ filePath: realSource });
		await symlink(realSource, sourcePath);

		const result = await writeStandaloneJianyingDraft({
			draftName: "Symlink",
			outputParentDirectory: parentDirectory,
			snapshot: createSnapshot({ sourcePath }),
			targetPlatform: "macos",
		});

		const copiedPath = join(
			result.outputDirectory,
			...result.copiedAssets[0].relativePath.split("/")
		);
		expect(await readFile(copiedPath)).toEqual(VALID_PNG_BYTES);
		expect(result.copiedAssets[0].sha256).toBe(
			createHash("sha256").update(VALID_PNG_BYTES).digest("hex")
		);
	});

	it("rejects a symlink that resolves to a directory", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-symlink-directory-",
		});
		const sourceDirectory = join(parentDirectory, "media-directory");
		const sourcePath = join(parentDirectory, "linked.png");
		await mkdir(sourceDirectory);
		await symlink(sourceDirectory, sourcePath);

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Directory symlink",
				outputParentDirectory: parentDirectory,
				snapshot: createSnapshot({ sourcePath }),
				targetPlatform: "macos",
			})
		).rejects.toThrow("regular file");
		expect(
			(await readdir(parentDirectory)).some((name) => name.endsWith(".staging"))
		).toBe(false);
	});

	it("refuses to write inside a JianYing application draft store", async () => {
		const root = await createTemporaryDirectory({
			prefix: "qcut-jianying-store-",
		});
		const draftStore = join(root, "com.lveditor.draft");
		await mkdir(draftStore);
		const sourcePath = join(root, "source.png");
		await writeValidPng({ filePath: sourcePath });

		await expect(
			writeStandaloneJianyingDraft({
				draftName: "Unsafe",
				outputParentDirectory: draftStore,
				snapshot: createSnapshot({ sourcePath }),
				targetPlatform: "macos",
			})
		).rejects.toThrow("refuses to write");
		expect(await readdir(draftStore)).toEqual([]);
	});

	it("rejects traversal and host-specific asset paths", () => {
		expect(() =>
			validateStandaloneAssetRelativePath({
				relativePath: "assets/video/clip.mp4",
			})
		).not.toThrow();
		for (const relativePath of [
			"../clip.mp4",
			"assets/../clip.mp4",
			"/assets/video/clip.mp4",
			"assets\\video\\clip.mp4",
		]) {
			expect(() =>
				validateStandaloneAssetRelativePath({ relativePath })
			).toThrow("Unsafe JianYing asset path");
		}
	});

	it("creates a new directory for repeated exports", async () => {
		const parentDirectory = await createTemporaryDirectory({
			prefix: "qcut-jianying-unique-",
		});
		const sourcePath = join(parentDirectory, "source.png");
		await writeValidPng({ filePath: sourcePath });
		const options = {
			draftName: "Same Name",
			outputParentDirectory: parentDirectory,
			snapshot: createSnapshot({ sourcePath }),
			targetPlatform: "macos" as const,
		};

		const [first, second] = await Promise.all([
			writeStandaloneJianyingDraft(options),
			writeStandaloneJianyingDraft(options),
		]);

		expect(first.outputDirectory).not.toBe(second.outputDirectory);
		expect(await lstat(first.contentPath)).toMatchObject({
			size: expect.any(Number),
		});
		expect(await lstat(second.contentPath)).toMatchObject({
			size: expect.any(Number),
		});
	});

	it.skipIf(!hasFfmpeg)(
		"rejects snapshot duration that exceeds the probed media duration",
		async () => {
			const parentDirectory = await createTemporaryDirectory({
				prefix: "qcut-jianying-duration-mismatch-",
			});
			const sourcePath = join(parentDirectory, "source.mp4");
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

			await expect(
				writeStandaloneJianyingDraft({
					draftName: "Wrong duration",
					outputParentDirectory: parentDirectory,
					snapshot: createVideoSnapshot({
						duration: 2,
						height: 180,
						sourcePath,
						width: 320,
					}),
					targetPlatform: "macos",
				})
			).rejects.toThrow("duration does not match snapshot");
			expect(await readdir(parentDirectory)).toEqual(["source.mp4"]);
		},
		30_000
	);

	it.skipIf(!hasFfmpeg)(
		"copies a real MP4 that remains probeable",
		async () => {
			const parentDirectory = await createTemporaryDirectory({
				prefix: "qcut-jianying-real-media-",
			});
			const sourcePath = join(parentDirectory, "source.mp4");
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

			const result = await writeStandaloneJianyingDraft({
				draftName: "Real Media",
				outputParentDirectory: parentDirectory,
				snapshot: createVideoSnapshot({
					duration: 1,
					height: 180,
					sourcePath,
					width: 320,
				}),
				targetPlatform: "macos",
			});
			const copiedPath = join(
				result.outputDirectory,
				...result.copiedAssets[0].relativePath.split("/")
			);
			const probe = spawnSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-select_streams",
					"v:0",
					"-show_entries",
					"stream=codec_type,width,height",
					"-of",
					"json",
					copiedPath,
				],
				{ encoding: "utf8" }
			);
			expect(probe.status, probe.stderr).toBe(0);
			expect(JSON.parse(probe.stdout).streams[0]).toMatchObject({
				codec_type: "video",
				height: 180,
				width: 320,
			});
			const hash = ({ bytes }: { bytes: Buffer }) =>
				createHash("sha256").update(bytes).digest("hex");
			expect(hash({ bytes: await readFile(copiedPath) })).toBe(
				hash({ bytes: await readFile(sourcePath) })
			);
		},
		30_000
	);
});
