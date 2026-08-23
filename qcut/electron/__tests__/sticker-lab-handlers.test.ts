import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	discoverLocalReferences: vi.fn(),
	getPath: vi.fn(() => "/mock/videos"),
	readLocalReference: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: mocks.getPath },
	ipcMain: { handle: vi.fn() },
}));

vi.mock("../native-pipeline/stickers/local-reference-catalog/index.js", () => ({
	discoverLocalReferences: mocks.discoverLocalReferences,
	readLocalReference: mocks.readLocalReference,
}));

import { ipcMain } from "electron";
import { registerStickerLabHandlers } from "../main-ipc/sticker-lab-handlers";

function getHandler({
	channel,
}: {
	channel: string;
}): (event: unknown, value?: unknown) => Promise<unknown> {
	const registration = vi
		.mocked(ipcMain.handle)
		.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
	if (!registration) throw new Error(`Missing IPC handler: ${channel}`);
	return registration[1] as (
		event: unknown,
		value?: unknown
	) => Promise<unknown>;
}

describe("Sticker Lab IPC handlers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.discoverLocalReferences.mockResolvedValue({ catalogs: [] });
		mocks.readLocalReference.mockResolvedValue({ bytes: new Uint8Array() });
		registerStickerLabHandlers();
	});

	it("defaults discovery to the platform videos directory", async () => {
		const discover = getHandler({
			channel: "sticker-lab:discover-local-references",
		});

		await discover({}, {});

		expect(mocks.getPath).toHaveBeenCalledWith("videos");
		expect(mocks.discoverLocalReferences).toHaveBeenCalledWith({
			videosDirectory: "/mock/videos",
		});
	});

	it("forwards an explicit discovery root without consulting app paths", async () => {
		const discover = getHandler({
			channel: "sticker-lab:discover-local-references",
		});

		await discover({}, { rootPath: "/private/stickers" });

		expect(mocks.getPath).not.toHaveBeenCalled();
		expect(mocks.discoverLocalReferences).toHaveBeenCalledWith({
			rootPath: "/private/stickers",
		});
	});

	it("forwards complete read identities", async () => {
		const read = getHandler({ channel: "sticker-lab:read-local-reference" });
		const options = {
			rootPath: "/private/stickers",
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "123",
		};

		await read({}, options);

		expect(mocks.readLocalReference).toHaveBeenCalledWith(options);
	});

	it("rejects incomplete IPC payloads", async () => {
		const discover = getHandler({
			channel: "sticker-lab:discover-local-references",
		});
		const read = getHandler({ channel: "sticker-lab:read-local-reference" });

		await expect(discover({}, { rootPath: "" })).rejects.toThrow(
			"rootPath must be a non-empty string"
		);
		await expect(
			read({}, { rootPath: "/private/stickers", batchId: "batch" })
		).rejects.toThrow("stickerId must be a non-empty string");
	});
});
