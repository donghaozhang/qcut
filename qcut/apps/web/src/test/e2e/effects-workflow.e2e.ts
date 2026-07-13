import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const screenshotPath = path.resolve(
	process.cwd(),
	"output/playwright/qcut-effects-electron-e2e.png"
);

interface ExposedTimelineState {
	tracks: Array<{
		id: string;
		elements: Array<{
			id: string;
			type: string;
			effects?: Array<{
				name: string;
				effectType: string;
				parameters: Record<string, number>;
				enabled: boolean;
			}>;
		}>;
	}>;
}

interface ExposedEditorWindow extends Window {
	__timelineStore: { getState: () => ExposedTimelineState };
}

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

async function appliedEffects({ page }: { page: Page }) {
	return page.evaluate(() => {
		const editorWindow = window as unknown as ExposedEditorWindow;
		return editorWindow.__timelineStore
			.getState()
			.tracks.flatMap((track) => track.elements)
			.find((element) => element.type === "media")?.effects;
	});
}

test.describe("Production effects workflow", () => {
	test("previews, applies, persists, and removes a real effect", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await createTestProject(page, "Effects Workflow E2E");
		await importTestVideo(page);
		await addVideo({ page });

		await page.getByTestId("effects-panel-tab").click();
		const effects = page.getByTestId("effects-view");
		await expect(effects).toBeVisible();
		const cards = effects.locator('[data-testid^="effect-card-"]');
		await expect(cards).toHaveCount(15);
		await expect(cards.locator("img")).toHaveCount(15);
		await expect
			.poll(() =>
				cards
					.locator("img")
					.evaluateAll((images) =>
						images.every(
							(image) =>
								(image as HTMLImageElement).complete &&
								(image as HTMLImageElement).naturalWidth > 0 &&
								(image as HTMLImageElement).style.filter.length > 0
						)
					)
			)
			.toBe(true);

		await effects.getByTestId("effect-card-sepia").click();
		await expect
			.poll(() => appliedEffects({ page }))
			.toEqual([
				expect.objectContaining({
					name: "Sepia",
					effectType: "sepia",
					parameters: { sepia: 80 },
					enabled: true,
				}),
			]);
		const previewVideo = page
			.getByTestId("preview-panel")
			.locator("video")
			.first();
		await expect
			.poll(() => previewVideo.evaluate((video) => video.style.filter))
			.toContain("sepia(0.8)");
		await expect(page.getByText("Sepia", { exact: true }).last()).toBeVisible();

		await mkdir(path.dirname(screenshotPath), { recursive: true });
		await page.screenshot({ path: screenshotPath, animations: "disabled" });

		await page.getByRole("button", { name: "Remove Sepia effect" }).click();
		await expect.poll(() => appliedEffects({ page })).toEqual([]);
	});
});
