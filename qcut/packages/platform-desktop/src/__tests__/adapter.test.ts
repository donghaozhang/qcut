import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformCapability } from "@qcut/platform-core";
import { createDesktopAdapter } from "../index";

describe("desktop Sticker Lab adapter", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("passes discovery and verified reads through the preload API", async () => {
		const discovery = {
			rootPath: "/private/stickers",
			catalogs: [],
			warnings: [],
			summary: {
				batchCount: 0,
				categoryCount: 0,
				itemCount: 0,
				totalBytes: 0,
			},
		};
		const readResult = {
			bytes: new Uint8Array([137, 80, 78, 71]),
			fileName: "123.png",
			mimeType: "image/png" as const,
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "123",
			checksumSha256: "a".repeat(64),
		};
		const discoverLocalReferences = vi.fn().mockResolvedValue(discovery);
		const readLocalReference = vi.fn().mockResolvedValue(readResult);
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { stickerLab: { discoverLocalReferences, readLocalReference } },
		});
		const adapter = createDesktopAdapter();
		expect(
			adapter.hasCapability(PlatformCapability.StickerLabLocalReferences)
		).toBe(true);

		await expect(
			adapter.stickerLab.discoverLocalReferences({
				rootPath: "/private/stickers",
			})
		).resolves.toBe(discovery);
		await expect(
			adapter.stickerLab.readLocalReference({
				rootPath: discovery.rootPath,
				batchId: readResult.batchId,
				stickerId: readResult.stickerId,
			})
		).resolves.toBe(readResult);
		expect(discoverLocalReferences).toHaveBeenCalledOnce();
		expect(readLocalReference).toHaveBeenCalledOnce();
	});

	it("forwards a runtime resource name unchanged to the preload API", async () => {
		const resourceName = "runtime/atlas-sheet";
		const readResult = {
			bytes: new Uint8Array([137, 80, 78, 71]),
			fileName: "atlas-sheet.png",
			mimeType: "image/png" as const,
			batchId: "jianying-2026-08-26-batch-99",
			stickerId: "990002",
			resourceName,
			checksumSha256: "b".repeat(64),
		};
		const readLocalReference = vi.fn().mockResolvedValue(readResult);
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: {
				stickerLab: {
					discoverLocalReferences: vi.fn(),
					readLocalReference,
				},
			},
		});

		await expect(
			createDesktopAdapter().stickerLab.readLocalReference({
				rootPath: "/private/stickers",
				batchId: readResult.batchId,
				stickerId: readResult.stickerId,
				resourceName,
			})
		).resolves.toBe(readResult);
		expect(readLocalReference).toHaveBeenCalledWith({
			rootPath: "/private/stickers",
			batchId: readResult.batchId,
			stickerId: readResult.stickerId,
			resourceName,
		});
	});
});
