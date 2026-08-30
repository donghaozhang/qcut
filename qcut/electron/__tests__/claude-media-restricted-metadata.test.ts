import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	StickerLabMediaMetadata,
	StickerLabRestrictedMediaMetadata,
} from "../types/sticker-lab-media-metadata.js";

const testState = vi.hoisted(() => ({ documentsRoot: "" }));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => testState.documentsRoot),
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
}));

vi.mock("electron-log", () => ({
	default: {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		log: vi.fn(),
		warn: vi.fn(),
	},
}));

import {
	deleteMediaFile,
	getMediaInfo,
	importMediaFile,
	listMediaFiles,
	renameMediaFile,
} from "../claude/handlers/claude-media-handler.js";
import { persistMediaRestrictedMetadata } from "../claude/handlers/claude-media-restricted-metadata.js";

const PROJECT_ID = "restricted-sidecar-test";
const METADATA: StickerLabMediaMetadata = {
	animatedSticker: true,
	batchId: "jianying-2026-08-23-batch-18-v2",
	checksumSha256:
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	itemId: "42001",
	redistribution: "prohibited",
	referenceOnly: true,
	source: "sticker-lab",
	usage: "internal-reference-only",
};

function getMediaDirectory(): string {
	return path.join(
		testState.documentsRoot,
		"QCut",
		"Projects",
		PROJECT_ID,
		"media"
	);
}

async function importFixture({ name = "reference.gif" } = {}) {
	const sourcePath = path.join(testState.documentsRoot, name);
	await fs.writeFile(sourcePath, "GIF89a", { mode: 0o600 });
	const media = await importMediaFile(PROJECT_ID, sourcePath);
	if (!media) {
		throw new Error(`importMediaFile returned null for ${name}`);
	}
	return media;
}

function getSidecarDirectory(): string {
	return path.join(getMediaDirectory(), ".qcut-restricted-media");
}

async function listSidecars(): Promise<string[]> {
	return fs.readdir(getSidecarDirectory());
}

function getSidecarPath({ sidecarName }: { sidecarName: string }): string {
	return path.join(getSidecarDirectory(), sidecarName);
}

describe("restricted Sticker Lab media metadata", () => {
	beforeEach(async () => {
		testState.documentsRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "qcut-restricted-media-")
		);
	});

	afterEach(async () => {
		await fs.rm(testState.documentsRoot, { force: true, recursive: true });
	});

	it("round-trips exact path-free provenance through listMediaFiles", async () => {
		const media = await importFixture();
		await persistMediaRestrictedMetadata({
			mediaId: media.id,
			metadata: METADATA,
			projectId: PROJECT_ID,
		});

		const listed = await listMediaFiles(PROJECT_ID);
		expect(listed).toHaveLength(1);
		expect(listed[0].metadata).toEqual(METADATA);
		await expect(getMediaInfo(PROJECT_ID, media.id)).resolves.toMatchObject({
			metadata: METADATA,
		});

		const sidecars = await listSidecars();
		expect(sidecars).toHaveLength(1);
		const sidecarPath = getSidecarPath({ sidecarName: sidecars[0] });
		const rawSidecar = await fs.readFile(sidecarPath, "utf8");
		expect(rawSidecar).not.toContain(testState.documentsRoot);
		if (process.platform !== "win32") {
			const stat = await fs.stat(sidecarPath);
			expect(stat.mode & 0o777).toBe(0o600);
		}
	});

	it("round-trips a bounded multi-frame runtime descriptor larger than 8 KiB", async () => {
		const frameCount = 100;
		const stickerRuntimeResources = Object.fromEntries(
			Array.from({ length: frameCount }, (_, index) => [
				`asset_${String(index + 1).padStart(4, "0")}`,
				`runtime-media-${index + 1}`,
			])
		);
		const metadata: StickerLabRestrictedMediaMetadata = {
			...METADATA,
			stickerRuntime: {
				kind: "png-sequence",
				completion: "freeze-last",
				cycleDurationSeconds: frameCount,
				frames: Array.from({ length: frameCount }, (_, index) => ({
					durationSeconds: 1,
					startSeconds: index,
					source: `$resource:asset_${String(index + 1).padStart(4, "0")}`,
				})),
				repeat: { kind: "infinite" },
			},
			stickerRuntimeResources,
		};
		expect(Buffer.byteLength(JSON.stringify(metadata), "utf8")).toBeGreaterThan(
			8192
		);
		const media = await importFixture({ name: "runtime-preview.png" });

		await persistMediaRestrictedMetadata({
			mediaId: media.id,
			metadata,
			projectId: PROJECT_ID,
		});

		await expect(getMediaInfo(PROJECT_ID, media.id)).resolves.toMatchObject({
			metadata,
		});
	});

	it("keeps the largest legal atlas sidecar within its persisted byte limit", async () => {
		const frameCount = 10_000;
		const frameIdLength = 300;
		const metadata: StickerLabRestrictedMediaMetadata = {
			...METADATA,
			stickerRuntime: {
				atlasSize: { height: 1, width: 1 },
				completion: "freeze-last",
				cycleDurationSeconds: frameCount,
				frames: Array.from({ length: frameCount }, (_, index) => {
					const indexText = String(index);
					return {
						durationSeconds: 1,
						frameRect: { height: 1, width: 1, x: 0, y: 0 },
						id: `${indexText}${"界".repeat(frameIdLength - indexText.length)}`,
						rotated: false,
						sourceSize: { height: 1, width: 1 },
						spriteSourceRect: {
							height: 1,
							width: 1,
							x: 0,
							y: 0,
						},
						startSeconds: index,
						trimmed: false,
					};
				}),
				kind: "atlas-animation",
				repeat: { kind: "infinite" },
			},
		};
		const importBodyBytes = Buffer.byteLength(
			JSON.stringify({ metadata, source: "/private/maximum-atlas.png" }),
			"utf8"
		);
		expect(importBodyBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
		const media = await importFixture({ name: "maximum-atlas.png" });

		await persistMediaRestrictedMetadata({
			mediaId: media.id,
			metadata,
			projectId: PROJECT_ID,
		});

		const [sidecarName] = await listSidecars();
		const stat = await fs.stat(getSidecarPath({ sidecarName }));
		expect(stat.size).toBeLessThanOrEqual(16 * 1024 * 1024);
		await expect(getMediaInfo(PROJECT_ID, media.id)).resolves.toMatchObject({
			metadata,
		});
	}, 30_000);

	it("rejects atlas frame IDs whose JSON escaping defeats byte bounds", async () => {
		const metadata: StickerLabRestrictedMediaMetadata = {
			...METADATA,
			stickerRuntime: {
				atlasSize: { height: 1, width: 1 },
				completion: "freeze-last",
				cycleDurationSeconds: 1,
				frames: [
					{
						durationSeconds: 1,
						frameRect: { height: 1, width: 1, x: 0, y: 0 },
						id: "frame\u0001id",
						rotated: false,
						sourceSize: { height: 1, width: 1 },
						spriteSourceRect: { height: 1, width: 1, x: 0, y: 0 },
						startSeconds: 0,
						trimmed: false,
					},
				],
				kind: "atlas-animation",
				repeat: { kind: "infinite" },
			},
		};

		await expect(
			persistMediaRestrictedMetadata({
				mediaId: "control-frame-id",
				metadata,
				projectId: PROJECT_ID,
			})
		).rejects.toThrow("must not contain control characters");
	});

	it("hides restricted media with a corrupt sidecar without hiding ordinary media", async () => {
		const restrictedMedia = await importFixture();
		await importFixture({ name: "ordinary.png" });
		await persistMediaRestrictedMetadata({
			mediaId: restrictedMedia.id,
			metadata: METADATA,
			projectId: PROJECT_ID,
		});
		const [sidecarName] = await listSidecars();
		await fs.writeFile(
			getSidecarPath({ sidecarName }),
			JSON.stringify({
				mediaId: restrictedMedia.id,
				metadata: { ...METADATA, rootPath: "/private/source" },
				version: 1,
			}),
			"utf8"
		);

		const listed = await listMediaFiles(PROJECT_ID);
		expect(listed).toHaveLength(1);
		expect(listed[0].name).toBe("ordinary.png");
		expect(listed[0].metadata).toBeUndefined();
	});

	it.runIf(process.platform !== "win32")(
		"refuses a sidecar replaced with a symbolic link",
		async () => {
			const media = await importFixture();
			await persistMediaRestrictedMetadata({
				mediaId: media.id,
				metadata: METADATA,
				projectId: PROJECT_ID,
			});
			const [sidecarName] = await listSidecars();
			const sidecarPath = getSidecarPath({ sidecarName });
			const externalPath = path.join(testState.documentsRoot, "external.json");
			await fs.writeFile(externalPath, await fs.readFile(sidecarPath));
			await fs.unlink(sidecarPath);
			await fs.symlink(externalPath, sidecarPath);

			const listed = await listMediaFiles(PROJECT_ID);
			expect(listed).toEqual([]);
		}
	);

	it.runIf(process.platform !== "win32")(
		"refuses a sidecar directory replaced with a symbolic link",
		async () => {
			const media = await importFixture();
			await persistMediaRestrictedMetadata({
				mediaId: media.id,
				metadata: METADATA,
				projectId: PROJECT_ID,
			});
			const externalDirectory = path.join(
				testState.documentsRoot,
				"external-sidecars"
			);
			await fs.rename(getSidecarDirectory(), externalDirectory);
			await fs.symlink(externalDirectory, getSidecarDirectory());
			const [externalSidecar] = await fs.readdir(externalDirectory);

			await expect(listMediaFiles(PROJECT_ID)).resolves.toEqual([]);
			await expect(deleteMediaFile(PROJECT_ID, media.id)).resolves.toBe(false);
			await expect(
				fs.stat(path.join(externalDirectory, externalSidecar))
			).resolves.toBeDefined();
		}
	);

	it("migrates provenance to the new deterministic ID on rename", async () => {
		const media = await importFixture();
		await persistMediaRestrictedMetadata({
			mediaId: media.id,
			metadata: METADATA,
			projectId: PROJECT_ID,
		});

		await expect(
			renameMediaFile(PROJECT_ID, media.id, "renamed.gif")
		).resolves.toBe(true);

		const listed = await listMediaFiles(PROJECT_ID);
		expect(listed).toHaveLength(1);
		expect(listed[0]).toMatchObject({
			metadata: METADATA,
			name: "renamed.gif",
		});
		expect(listed[0].id).not.toBe(media.id);
		expect(await listSidecars()).toHaveLength(1);
	});

	it("deletes the durable provenance during media rollback", async () => {
		const media = await importFixture();
		await persistMediaRestrictedMetadata({
			mediaId: media.id,
			metadata: METADATA,
			projectId: PROJECT_ID,
		});

		await expect(deleteMediaFile(PROJECT_ID, media.id)).resolves.toBe(true);
		expect(await listMediaFiles(PROJECT_ID)).toEqual([]);
		expect(await listSidecars()).toEqual([]);
	});
});
