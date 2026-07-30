import { describe, expect, it, vi } from "vitest";
import { createLocalStickerReference } from "./fixtures/local-sticker-catalog";
import { loadLocalStickerReferenceFile } from "../local-sticker-reference";

describe("local sticker reference files", () => {
	it("loads an owned image file through the injected desktop reader", async () => {
		const reference = createLocalStickerReference({ id: "curved-arrow" });
		const bytes = new Uint8Array([137, 80, 78, 71]);
		const readFile = vi.fn(async () => bytes);

		const file = await loadLocalStickerReferenceFile({
			reference,
			readFile,
		});

		expect(readFile).toHaveBeenCalledWith({ filePath: reference.filePath });
		expect(file.name).toBe("curved-arrow.png");
		expect(file.type).toBe("image/png");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
		bytes.fill(0);
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
	});

	it("rejects a missing local file", async () => {
		const reference = createLocalStickerReference({ id: "missing" });

		await expect(
			loadLocalStickerReferenceFile({
				reference,
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker");
	});
});
