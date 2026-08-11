import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type Page,
} from "@playwright/test";
import {
	createTestProject,
	importTestVideo,
	navigateToProjects,
} from "./helpers/electron-helpers";

const cacheRoot = join(
	homedir(),
	"Movies",
	"JianyingPro",
	"User Data",
	"Cache",
	"artistEffect"
);
const enabled =
	process.env.QCUT_JIANYING_FILTER_LAB_E2E === "1" && existsSync(cacheRoot);

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

async function filteredPreviewStats({ page }: { page: Page }) {
	const preview = page.getByTestId("color-preview-canvas").first();
	await expect(preview).toBeVisible();
	return preview.evaluate((canvas: HTMLCanvasElement) => {
		const context = canvas.getContext("2d");
		if (!context || canvas.width === 0 || canvas.height === 0) {
			return { chroma: Number.POSITIVE_INFINITY, samples: 0, signature: 0 };
		}
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let signature = 0;
		let chroma = 0;
		let samples = 0;
		for (let index = 0; index < pixels.length; index += 388) {
			const red = pixels[index];
			const green = pixels[index + 1];
			const blue = pixels[index + 2];
			signature = (signature + red * 3 + green * 5 + blue * 7) % 1_000_000_007;
			chroma += Math.abs(red - green) + Math.abs(green - blue);
			samples += 1;
		}
		return { chroma: chroma / samples, samples, signature };
	});
}

test.describe("Local Jianying filter lab", () => {
	test.skip(
		!enabled,
		"Requires a local Jianying LUT cache and explicit opt-in"
	);

	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("lists and applies a real cached LUT", async ({}, testInfo) => {
		test.setTimeout(120_000);
		const profileDirectory = join(
			tmpdir(),
			`qcut-filter-lab-${process.pid}-${Date.now()}`
		);
		const evidenceDirectory =
			process.env.QCUT_JIANYING_FILTER_LAB_EVIDENCE ??
			testInfo.outputPath("evidence");
		await mkdir(evidenceDirectory, { recursive: true });
		const electronApp = await electron.launch({
			args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
			cwd: process.cwd(),
			env: { ...process.env, NODE_ENV: "test" },
		});

		try {
			const page = await electronApp.firstWindow();
			await page.waitForLoadState("domcontentloaded");
			await page.waitForFunction(
				() => Boolean(document.querySelector("#root")?.children.length),
				undefined,
				{ timeout: 30_000 }
			);
			await page.evaluate(() => {
				localStorage.setItem("hasSeenOnboarding", "true");
			});
			await navigateToProjects(page);
			await createTestProject(page, "Jianying Filter Lab E2E");
			await importTestVideo(page);
			await addVideo({ page });

			await page.getByTestId("adjustments-panel-tab").click();
			await expect(page.getByTestId("adjustments-view")).toBeVisible();
			await page.getByRole("button", { name: "滤镜实验室" }).click();
			const lab = page.getByTestId("jianying-filter-lab");
			await expect(lab.getByText("高清黑白")).toBeVisible({ timeout: 30_000 });
			await lab.screenshot({
				path: join(evidenceDirectory, "01-filter-lab-list.png"),
				animations: "disabled",
			});

			await lab.getByRole("button", { name: "应用 高清黑白" }).click();
			await expect
				.poll(() =>
					page.evaluate(() => {
						const appWindow = window as unknown as {
							__timelineStore: {
								getState: () => {
									tracks: Array<{
										elements: Array<{
											type: string;
											color?: {
												lut?: {
													name?: string;
													cube?: { size: number; values: number[] };
												};
											};
										}>;
									}>;
								};
							};
						};
						const adjustment = appWindow.__timelineStore
							.getState()
							.tracks.flatMap(({ elements }) => elements)
							.find(({ type }) => type === "adjustment");
						return {
							name: adjustment?.color?.lut?.name,
							size: adjustment?.color?.lut?.cube?.size,
							values: adjustment?.color?.lut?.cube?.values.length,
						};
					})
				)
				.toEqual({ name: "高清黑白", size: 16, values: 12_288 });
			await expect
				.poll(async () => (await filteredPreviewStats({ page })).samples)
				.toBeGreaterThan(100);
			const previewStats = await filteredPreviewStats({ page });
			expect(previewStats.samples).toBeGreaterThan(100);
			expect(previewStats.signature).toBeGreaterThan(0);
			expect(previewStats.chroma).toBeLessThan(8);
			await page.screenshot({
				path: join(evidenceDirectory, "02-filter-applied.png"),
				animations: "disabled",
			});
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
