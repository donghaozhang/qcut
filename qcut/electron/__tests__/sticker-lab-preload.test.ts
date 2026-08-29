import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({ ipcRenderer: { invoke } }));

import { createStickerLabAPI } from "../preload-integrations";

describe("Sticker Lab preload API", () => {
	beforeEach(() => {
		invoke.mockReset();
		invoke.mockResolvedValue(undefined);
	});

	it("uses object payloads for discovery and verified reads", async () => {
		const stickerLab = createStickerLabAPI();

		await stickerLab.discoverLocalReferences({});
		await stickerLab.discoverLocalReferences({ rootPath: "/private/stickers" });
		await stickerLab.readLocalReference({
			rootPath: "/private/stickers",
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "123",
		});
		await stickerLab.readLocalReference({
			rootPath: "/private/stickers",
			batchId: "jianying-2026-08-28-batch-99",
			stickerId: "990103",
			resourceName: "runtime/alpha.webm",
		});

		expect(invoke.mock.calls).toEqual([
			["sticker-lab:discover-local-references", {}],
			[
				"sticker-lab:discover-local-references",
				{ rootPath: "/private/stickers" },
			],
			[
				"sticker-lab:read-local-reference",
				{
					rootPath: "/private/stickers",
					batchId: "jianying-2026-08-23-batch-18-v2",
					stickerId: "123",
				},
			],
			[
				"sticker-lab:read-local-reference",
				{
					rootPath: "/private/stickers",
					batchId: "jianying-2026-08-28-batch-99",
					stickerId: "990103",
					resourceName: "runtime/alpha.webm",
				},
			],
		]);
	});
});
