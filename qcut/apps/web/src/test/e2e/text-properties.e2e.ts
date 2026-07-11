import { expect, test, ensureTextTabActive } from "./helpers/electron-helpers";

test.describe("Text properties", () => {
	test("edits typography, presets, animation, and keyframes", async ({
		page,
	}, testInfo) => {
		await page.getByTestId("new-project-button").click();
		await page.waitForSelector('[data-testid="timeline-track"]');
		await ensureTextTabActive(page);

		await page.getByTestId("text-overlay-button").click();
		const timelineElements = page.getByTestId("timeline-element");
		await expect(timelineElements.last()).toBeVisible();
		await timelineElements.last().click();
		await page.getByTestId("panel-tab-properties").click();

		const properties = page.getByTestId("text-properties");
		await expect(properties).toBeVisible();
		await expect(properties.getByLabel("Text content")).toHaveValue(
			"Default text"
		);
		await expect(
			properties.getByLabel("Apply Yellow pop text preset")
		).toBeVisible();

		await properties.getByLabel("Apply Yellow pop text preset").click();
		await properties.getByRole("button", { name: "Animation" }).click();
		await properties.getByRole("button", { name: "slide up" }).click();
		await expect(
			properties.getByLabel("Duration", { exact: true })
		).toBeVisible();

		await properties.getByRole("button", { name: "Keyframes" }).click();
		await expect(
			properties.getByRole("button", { name: /X position \(0 keyframes\)/ })
		).toBeVisible();
		await properties
			.getByRole("button", {
				name: "Add keyframe at current frame",
				exact: true,
			})
			.click();
		await expect(properties.getByText("(1 keyframe)")).toBeVisible();

		await page
			.locator("[data-ruler-area]")
			.click({ position: { x: 25, y: 20 } });
		await expect(
			page.getByTestId("preview-panel").getByText("Default text")
		).toBeVisible();
		await page.waitForTimeout(750);

		await testInfo.attach("text-properties", {
			body: await properties.screenshot(),
			contentType: "image/png",
		});
		await testInfo.attach("text-preview", {
			body: await page.getByTestId("preview-panel").screenshot(),
			contentType: "image/png",
		});
	});
});
