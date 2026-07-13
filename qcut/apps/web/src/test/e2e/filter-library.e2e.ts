import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDirectory =
	process.env.QCUT_FILTER_AUDIT_DIR ??
	path.join(process.env.TMPDIR ?? "/tmp", "qcut-filter-library-audit");

const categoryCases = [
	{ id: "summer", count: 3 },
	{ id: "portrait", count: 3 },
	{ id: "landscape", count: 3 },
	{ id: "food", count: 3 },
	{ id: "camera", count: 3, screenshot: "00-camera.png" },
	{ id: "latest", count: 9 },
	{ id: "night", count: 3, screenshot: "00-night.png" },
	{ id: "cinematic", count: 3 },
	{ id: "outdoor", count: 2 },
	{ id: "stylized", count: 2, screenshot: "00-stylized.png" },
	{ id: "monochrome", count: 2 },
	{ id: "hd", count: 2, screenshot: "00-hd.png" },
	{ id: "film", count: 2 },
	{ id: "basic", count: 3 },
	{ id: "indoor", count: 2 },
] as const;

async function addVideo({ page }: { page: Page }) {
	const mediaItem = page.getByTestId("media-item").first();
	await expect(mediaItem).toBeVisible();
	await mediaItem.hover();
	await mediaItem.locator("button").first().click({ force: true });
	const clip = page.locator(
		'[data-testid="timeline-track"][data-track-type="media"] [data-testid="timeline-element"]'
	);
	await expect(clip).toHaveCount(1);
	await clip.click();
}

async function openFilters({ page }: { page: Page }) {
	await page.getByTestId("filters-panel-tab").click();
	await expect(page.getByTestId("filters-view")).toBeVisible();
}

async function activeFilter({ page }: { page: Page }) {
	return page.evaluate(() => {
		const timeline = (window as any).__timelineStore.getState();
		const element = timeline.tracks
			.flatMap((track: any) => track.elements)
			.find((candidate: any) => candidate.type === "media");
		return element?.color?.filter;
	});
}

test.describe("Filter library", () => {
	test("applies, searches, favorites, persists, and renders a real preview", async ({
		page,
	}) => {
		test.setTimeout(150_000);
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Filter Library E2E");
		await importTestVideo(page);
		await addVideo({ page });
		await openFilters({ page });

		const filters = page.getByTestId("filters-view");
		await expect(filters.locator('[data-testid^="filter-card-"]')).toHaveCount(
			37
		);
		await filters.screenshot({
			path: path.join(outputDirectory, "00-library.png"),
			animations: "disabled",
		});
		for (const categoryCase of categoryCases) {
			await filters.getByTestId(`filter-category-${categoryCase.id}`).click();
			const categoryCards = filters.locator('[data-testid^="filter-card-"]');
			await expect(categoryCards).toHaveCount(categoryCase.count);
			const firstCard = categoryCards.first();
			const firstId = (await firstCard.getAttribute("data-testid"))?.replace(
				"filter-card-",
				""
			);
			if (!firstId) throw new Error(`${categoryCase.id} has no filter card`);
			await expect
				.poll(() =>
					firstCard.locator("img").evaluate((image: HTMLImageElement) => ({
						complete: image.complete,
						naturalWidth: image.naturalWidth,
					}))
				)
				.toEqual({ complete: true, naturalWidth: 288 });
			await firstCard.click();
			await expect
				.poll(async () => (await activeFilter({ page }))?.presetId)
				.toBe(firstId);
			if (categoryCase.screenshot) {
				await page.waitForTimeout(100);
				await page.screenshot({
					path: path.join(outputDirectory, categoryCase.screenshot),
					animations: "disabled",
				});
			}
		}
		await filters.getByTestId("filter-category-all").click();
		await filters.getByTestId("filter-card-none").click();

		await filters.getByTestId("filter-card-teal-gold").click();
		await expect
			.poll(() => activeFilter({ page }))
			.toEqual({
				presetId: "teal-gold",
				presetVersion: 1,
				intensity: 72,
			});
		const preview = page.getByTestId("color-preview-canvas").first();
		await expect(preview).toBeVisible();
		await expect
			.poll(() =>
				preview.evaluate((canvas: HTMLCanvasElement) => {
					const context = canvas.getContext("2d");
					if (!context || canvas.width === 0 || canvas.height === 0) return 0;
					const pixels = context.getImageData(
						0,
						0,
						canvas.width,
						canvas.height
					).data;
					let nonBlank = 0;
					for (let index = 3; index < pixels.length; index += 64) {
						if (pixels[index] > 0) nonBlank += 1;
					}
					return nonBlank;
				})
			)
			.toBeGreaterThan(20);
		await page.screenshot({
			path: path.join(outputDirectory, "01-applied-preview.png"),
			animations: "disabled",
		});

		await page.evaluate(() =>
			(window as any).__timelineStore.getState().undo()
		);
		await expect
			.poll(async () => (await activeFilter({ page }))?.presetId ?? "none")
			.toBe("none");
		await filters.getByTestId("filter-card-teal-gold").click();

		const intensity = filters.getByRole("slider", { name: "Filter intensity" });
		await intensity.press("Home");
		await expect
			.poll(async () => (await activeFilter({ page }))?.intensity)
			.toBe(0);
		const thumbBounds = await intensity.boundingBox();
		const trackBounds = await filters
			.getByTestId("filter-intensity-slider")
			.boundingBox();
		if (!thumbBounds || !trackBounds) {
			throw new Error("Filter intensity slider has no bounds");
		}
		await page.mouse.move(
			thumbBounds.x + thumbBounds.width / 2,
			thumbBounds.y + thumbBounds.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			trackBounds.x + trackBounds.width * 0.4,
			trackBounds.y + trackBounds.height / 2,
			{ steps: 8 }
		);
		await page.mouse.up();
		await expect
			.poll(async () => (await activeFilter({ page }))?.intensity)
			.toBeGreaterThanOrEqual(35);
		await expect
			.poll(async () => (await activeFilter({ page }))?.intensity)
			.toBeLessThanOrEqual(45);

		await filters
			.getByRole("button", { name: "Favorite Teal Gold", exact: true })
			.click();
		await filters
			.getByRole("button", { name: "Favorites", exact: true })
			.click();
		await expect(filters.getByTestId("filter-card-teal-gold")).toBeVisible();
		await expect(filters.locator('[data-testid^="filter-card-"]')).toHaveCount(
			1
		);
		await filters.screenshot({
			path: path.join(outputDirectory, "02-favorites.png"),
			animations: "disabled",
		});

		await filters.getByRole("button", { name: "Filter library" }).click();
		await filters.getByLabel("Search filters").fill("黑白");
		await expect(filters.getByTestId("filter-card-neutral-mono")).toBeVisible();
		await expect(filters.getByTestId("filter-card-hard-mono")).toBeVisible();
		await expect(filters.locator('[data-testid^="filter-card-"]')).toHaveCount(
			2
		);
		await filters.screenshot({
			path: path.join(outputDirectory, "03-bilingual-search.png"),
			animations: "disabled",
		});

		await filters.getByLabel("Search filters").fill("");
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const element = timeline.tracks
				.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			localStorage.setItem(
				"qcut-color-presets",
				JSON.stringify([
					{
						id: "e2e-saved-look",
						name: "E2E Saved Look",
						createdAt: new Date().toISOString(),
						color: element.color,
					},
				])
			);
			window.dispatchEvent(new Event("qcut:color-presets-changed"));
		});
		await filters.getByTestId("filter-category-mine").click();
		await expect(
			filters.getByTestId("filter-card-e2e-saved-look")
		).toBeVisible();
		await filters.getByTestId("filter-card-e2e-saved-look").click();
		await filters.screenshot({
			path: path.join(outputDirectory, "04-my-filters.png"),
			animations: "disabled",
		});

		const expectedBeforeReopen = await activeFilter({ page });
		await page.waitForTimeout(800);
		await page.evaluate(() => {
			window.location.hash = "#/projects";
		});
		await page.waitForSelector('[data-testid="project-list-item"]');
		await page.getByTestId("project-list-item").first().click();
		await page.waitForSelector('[data-testid="timeline-element"]');
		await expect
			.poll(() => activeFilter({ page }))
			.toEqual(expectedBeforeReopen);
		await page.locator('[data-testid="timeline-element"]').first().click();
		await openFilters({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "05-reopened-project.png"),
			animations: "disabled",
		});
	});
});
