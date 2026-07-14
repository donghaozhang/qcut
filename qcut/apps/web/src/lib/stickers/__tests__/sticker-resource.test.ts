import { describe, expect, it, vi } from "vitest";
import { downloadStickerResource } from "../sticker-resource";

describe("sticker resources", () => {
	it("loads bundled QCut originals without a remote cache dependency", async () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" />';
		const fetchImpl = vi.fn(
			async () =>
				new Response(svg, {
					status: 200,
					headers: { "content-type": "image/svg+xml" },
				})
		) as unknown as typeof fetch;
		const downloaded = await downloadStickerResource({
			collection: "qcut-original",
			fetchImpl,
			icon: "pink-rabbit-happy",
			name: "粉红兔子/开心",
		});

		expect(fetchImpl).toHaveBeenCalledWith(
			"/stickers/qcut-original/pink-rabbit/happy.svg"
		);
		expect(downloaded.asset.delivery).toBe("bundled");
		expect(downloaded.file.name).toBe("粉红兔子-开心.svg");
		expect(downloaded.file.type).toContain("image/svg+xml");
		expect(downloaded.blob.size).toBeGreaterThan(0);
	});
});
