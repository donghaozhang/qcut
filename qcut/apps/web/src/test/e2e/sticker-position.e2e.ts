import {
	test,
	expect,
	createTestProject,
	ensureStickersTabActive,
} from "./helpers/electron-helpers";

test.describe("Sticker placement", () => {
	test("renders a freshly added sticker centered with real geometry", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await createTestProject(page, "Sticker Position Regression");
		await ensureStickersTabActive(page);
		const firstSticker = page.getByTestId("sticker-item").first();
		await firstSticker.waitFor({ state: "visible", timeout: 30_000 });
		await firstSticker.click();

		const layer = page.locator('[data-testid^="timeline-sticker-layer-"]');
		await layer.waitFor({ state: "attached", timeout: 15_000 });
		const image = layer.locator("img");
		await image.waitFor({ state: "attached", timeout: 15_000 });

		// The measurement retries across frames; poll until geometry settles.
		await expect
			.poll(
				async () => {
					const box = await image.boundingBox();
					return box ? Math.min(box.width, box.height) : 0;
				},
				{ timeout: 10_000 }
			)
			.toBeGreaterThan(10);

		const layerBox = await layer.boundingBox();
		const imageBox = await image.boundingBox();
		if (!layerBox || !imageBox) throw new Error("missing bounding boxes");

		// Default position is 50%/50%: the sticker center must sit at the
		// canvas center, not collapse to the top-left corner.
		const layerCenterX = layerBox.x + layerBox.width / 2;
		const layerCenterY = layerBox.y + layerBox.height / 2;
		const imageCenterX = imageBox.x + imageBox.width / 2;
		const imageCenterY = imageBox.y + imageBox.height / 2;
		expect(Math.abs(imageCenterX - layerCenterX)).toBeLessThan(4);
		expect(Math.abs(imageCenterY - layerCenterY)).toBeLessThan(4);
	});
});
