import {
	test,
	expect,
	createTestProject,
	ensureTextTabActive,
} from "./helpers/electron-helpers";

test.describe("Text selection box", () => {
	test("hugs the rendered text run instead of the logical box", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await createTestProject(page, "Text Overlay Box");
		await ensureTextTabActive(page);
		await page.getByTestId("text-overlay-button").click();
		const timelineElements = page.getByTestId("timeline-element");
		await timelineElements.last().waitFor({ state: "visible" });
		await timelineElements.last().click();

		const overlay = page.getByTestId("interactive-element-overlay");
		await overlay.waitFor({ state: "visible", timeout: 10_000 });

		await expect
			.poll(async () => {
				const box = await overlay.boundingBox();
				return box ? box.width : 0;
			})
			.toBeGreaterThan(100);

		const box = await overlay.boundingBox();
		if (!box) throw new Error("overlay has no bounding box");

		// A single-line default text is a wide, short run. The legacy logical
		// box (640x180) and the 200x100 transform fallback both fail one of
		// these bounds at any preview scale.
		expect(box.height).toBeLessThan(50);
		expect(box.width / box.height).toBeGreaterThan(2.5);
	});
});
