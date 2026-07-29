import { expect, test, ensureTextTabActive } from "./helpers/electron-helpers";

test.describe("Text properties", () => {
	test("edits typography, presets, animation, and keyframes", async ({
		page,
	}, testInfo) => {
		await page.getByTestId("language-selector").click();
		await page.getByRole("menuitemradio", { name: "English" }).click();
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
		const highlightPreset = properties.getByLabel(
			"Apply Highlight text preset"
		);
		const highlightPreview = highlightPreset.getByTestId("text-preset-preview");
		await expect(highlightPreview).toHaveText("Aa");
		expect(
			await highlightPreset.evaluate((element) => element.style.backgroundColor)
		).toBe("");
		expect(
			await highlightPreview.evaluate(
				(element) => element.style.backgroundColor
			)
		).not.toBe("");

		await properties.getByLabel("Apply Yellow pop text preset").click();
		await properties.getByRole("tab", { name: "Animation" }).click();
		await properties.getByRole("radio", { name: "slide up" }).click();
		await expect(
			properties.getByRole("slider", { name: "Duration" })
		).toBeVisible();

		await properties.getByRole("tab", { name: "Text" }).click();
		await properties.getByRole("button", { name: "Keyframes" }).click();
		const keyframeCount = properties.getByTestId("keyframe-count");
		await expect(keyframeCount).toContainText("0");
		await properties.getByTestId("keyframe-add-current").click();
		await expect(keyframeCount).toContainText("1");

		await page
			.locator("[data-ruler-area]")
			.click({ position: { x: 25, y: 20 } });
		await expect(
			page
				.getByTestId("preview-panel")
				.getByRole("button", { name: /Default text/ })
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
