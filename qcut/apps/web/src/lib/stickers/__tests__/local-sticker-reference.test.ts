import { describe, expect, it, vi } from "vitest";
import {
	buildLocalStickerReferences,
	loadLocalStickerReferenceFile,
} from "../local-sticker-reference";

describe("local sticker references", () => {
	it("only exposes the reference in a configured development build", () => {
		expect(
			buildLocalStickerReferences({
				filePath: "/tmp/arrow.png",
				isEnabled: false,
			})
		).toEqual([]);
		expect(
			buildLocalStickerReferences({
				filePath: "   ",
				isEnabled: true,
			})
		).toEqual([]);

		const [reference] = buildLocalStickerReferences({
			filePath: " /tmp/arrow.png ",
			isEnabled: true,
		});
		expect(reference).toMatchObject({
			displayName: "手绘弯箭头",
			filePath: "/tmp/arrow.png",
			frameCount: 4,
			frameRate: 5,
			cycleDuration: 0.8,
		});
	});

	it("loads an owned image file through the injected desktop reader", async () => {
		const [reference] = buildLocalStickerReferences({
			filePath: "/tmp/arrow.png",
			isEnabled: true,
		});
		const readFile = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));

		const file = await loadLocalStickerReferenceFile({
			reference,
			readFile,
		});

		expect(readFile).toHaveBeenCalledWith({ filePath: "/tmp/arrow.png" });
		expect(file.name).toBe("hand-drawn-curved-arrow.png");
		expect(file.type).toBe("image/png");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
	});

	it("rejects a missing local file", async () => {
		const [reference] = buildLocalStickerReferences({
			filePath: "/tmp/missing.png",
			isEnabled: true,
		});

		await expect(
			loadLocalStickerReferenceFile({
				reference,
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker");
	});
});
