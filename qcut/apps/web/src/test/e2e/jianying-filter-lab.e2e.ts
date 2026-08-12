import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type Locator,
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

type TestLut = {
	name?: string;
	enabled?: boolean;
	intensity?: number;
	cube?: { size: number; values: number[] };
	dual?: {
		maskKind?: string;
		skinCube?: { size: number; values: number[] };
	};
};

type TestTimelineStore = {
	getState: () => {
		tracks: Array<{
			elements: Array<{
				type: string;
				color?: { lut?: TestLut };
			}>;
		}>;
	};
};

async function adjustmentLutState({ page }: { page: Page }) {
	return page.evaluate(() => {
		const appWindow = window as unknown as {
			__timelineStore: TestTimelineStore;
		};
		const lut = appWindow.__timelineStore
			.getState()
			.tracks.flatMap(({ elements }) => elements)
			.find(({ type }) => type === "adjustment")?.color?.lut;
		return {
			name: lut?.name,
			enabled: lut?.enabled,
			intensity: lut?.intensity,
			size: lut?.cube?.size,
			values: lut?.cube?.values.length,
			skinSize: lut?.dual?.skinCube?.size,
			skinValues: lut?.dual?.skinCube?.values.length,
			maskKind: lut?.dual?.maskKind,
		};
	});
}

async function findFilter({ lab, title }: { lab: Locator; title: string }) {
	await lab.getByRole("searchbox", { name: "搜索剪映滤镜目录" }).fill(title);
	const applyButton = lab.getByRole("button", {
		name: `应用 ${title}`,
		exact: true,
	});
	await expect(applyButton).toBeVisible();
	return applyButton;
}

test.describe("Local Jianying filter lab", () => {
	test.skip(
		!enabled,
		"Requires a local Jianying LUT cache and explicit opt-in"
	);

	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("applies real single, dual, and shader filters", async ({}, testInfo) => {
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
			await expect(
				lab.getByText(/显示 \d+ · 可用 \d+\/883 · 缓存 \d+/)
			).toBeVisible();
			await expect(
				lab.getByRole("tab", { name: /^全部 \d+\/883$/ })
			).toBeVisible();
			await expect(
				lab.getByRole("tab", { name: /^人像 \d+\/\d+$/ })
			).toBeVisible();
			await lab.getByRole("button", { name: "重新扫描本机剪映缓存" }).click();
			await expect(
				lab.getByText(/显示 \d+ · 可用 \d+\/883 · 缓存 \d+/)
			).toBeVisible({ timeout: 30_000 });
			await page.screenshot({
				path: join(evidenceDirectory, "01-filter-lab-list.png"),
				animations: "disabled",
			});

			const singleLutButton = await findFilter({ lab, title: "高清黑白" });
			await singleLutButton.click();
			await expect
				.poll(() => adjustmentLutState({ page }))
				.toMatchObject({ name: "高清黑白", size: 16, values: 12_288 });
			await expect
				.poll(async () => (await filteredPreviewStats({ page })).samples)
				.toBeGreaterThan(100);
			const previewStats = await filteredPreviewStats({ page });
			expect(previewStats.samples).toBeGreaterThan(100);
			expect(previewStats.signature).toBeGreaterThan(0);
			expect(previewStats.chroma).toBeLessThan(8);
			const previewSurface = page.getByTestId("preview-capture-surface");
			const filteredPreviewImage = await previewSurface.screenshot({
				animations: "disabled",
			});
			await page.screenshot({
				path: join(evidenceDirectory, "02-single-lut-applied.png"),
				animations: "disabled",
			});

			const controls = lab.getByTestId("jianying-filter-lab-controls");
			await controls.getByRole("button", { name: "A 原图" }).click();
			await expect
				.poll(async () => (await adjustmentLutState({ page })).enabled)
				.toBe(false);
			await expect
				.poll(async () => {
					const image = await previewSurface.screenshot({
						animations: "disabled",
					});
					return image.equals(filteredPreviewImage);
				})
				.toBe(false);
			const originalPreviewImage = await previewSurface.screenshot({
				animations: "disabled",
			});
			await page.screenshot({
				path: join(evidenceDirectory, "03-original-a-preview.png"),
				animations: "disabled",
			});
			await controls.getByRole("button", { name: "B 滤镜" }).click();
			await expect
				.poll(async () => (await adjustmentLutState({ page })).enabled)
				.toBe(true);
			await expect
				.poll(async () => {
					const image = await previewSurface.screenshot({
						animations: "disabled",
					});
					return image.equals(originalPreviewImage);
				})
				.toBe(false);
			const intensity = controls.getByRole("slider", {
				name: "剪映滤镜强度",
			});
			await intensity.press("Home");
			await expect
				.poll(async () => (await adjustmentLutState({ page })).intensity)
				.toBe(0);
			await intensity.press("ArrowRight");
			await expect
				.poll(async () => (await adjustmentLutState({ page })).intensity)
				.toBe(1);
			await expect(controls.getByText("1%", { exact: true })).toBeVisible();
			await intensity.press("End");

			const dualLutButton = await findFilter({ lab, title: "奥林巴斯" });
			await expect(dualLutButton.getByText("双 LUT")).toBeVisible();
			await expect(dualLutButton.getByText("未验证")).toBeVisible();
			await dualLutButton.click();
			await expect
				.poll(() => adjustmentLutState({ page }))
				.toMatchObject({
					name: "奥林巴斯",
					size: 64,
					values: 786_432,
					skinSize: 64,
					skinValues: 786_432,
					maskKind: "skin-tone-v1",
					enabled: true,
				});
			const dualFilteredStats = await filteredPreviewStats({ page });
			await page.screenshot({
				path: join(evidenceDirectory, "04-olympus-dual-lut-applied.png"),
				animations: "disabled",
			});

			await lab
				.getByRole("searchbox", { name: "搜索剪映滤镜目录" })
				.fill("黑金");
			const shaderButton = lab
				.getByRole("button", { name: "应用 黑金", exact: true })
				.filter({ hasText: "Shader" })
				.first();
			await expect(shaderButton).toBeVisible();
			await expect(shaderButton.getByText("Shader")).toBeVisible();
			await expect(shaderButton.getByText("未验证")).toBeVisible();
			await shaderButton.click();
			await expect
				.poll(() => adjustmentLutState({ page }))
				.toMatchObject({
					name: "黑金",
					size: 64,
					values: 786_432,
					enabled: true,
					intensity: 100,
				});
			await expect
				.poll(async () => (await adjustmentLutState({ page })).skinSize)
				.toBeUndefined();
			const shaderStats = await filteredPreviewStats({ page });
			expect(shaderStats.samples).toBeGreaterThan(100);
			expect(shaderStats.signature).toBeGreaterThan(0);
			expect(shaderStats.signature).not.toBe(dualFilteredStats.signature);
			await shaderButton
				.locator("..")
				.getByRole("button", { name: "收藏 黑金" })
				.click();
			await lab.getByRole("tab", { name: "收藏", exact: true }).click();
			await expect(
				lab.getByRole("button", { name: "应用 黑金", exact: true })
			).toBeVisible();
			await lab.getByRole("tab", { name: "最近", exact: true }).click();
			await expect(
				lab.getByRole("button", { name: "应用 黑金", exact: true })
			).toBeVisible();
			await page.screenshot({
				path: join(evidenceDirectory, "05-shader-favorites-recent.png"),
				animations: "disabled",
			});
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
