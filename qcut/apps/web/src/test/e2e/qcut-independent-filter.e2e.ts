import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type Page,
} from "@playwright/test";
import type { TimelineTrack } from "@/types/timeline";
import {
	createTestProject,
	navigateToProjects,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	exportAndVerifyMovingVideo,
	trimTimelineToOneSecond,
} from "./helpers/jianying-filter-lab-video-evidence";

const source = process.env.QCUT_INDEPENDENT_FILTER_VIDEO ?? "";
const enabled =
	process.platform === "darwin" &&
	process.env.QCUT_INDEPENDENT_FILTER_E2E === "1" &&
	existsSync(source);

async function readEffect({ page }: { page: Page }) {
	return page.evaluate(() => {
		const tracks = (
			window as unknown as {
				__timelineStore: { getState: () => { tracks: TimelineTrack[] } };
			}
		).__timelineStore.getState().tracks;
		return tracks
			.flatMap((track) => track.elements)
			.find((element) => element.type === "adjustment")?.color?.multiPass;
	});
}

async function expectRenderedPreview({ page }: { page: Page }) {
	const preview = page.getByTestId("color-preview-canvas").first();
	await expect(preview).toBeVisible({ timeout: 30_000 });
	await expect
		.poll(
			() =>
				preview.evaluate((canvas: HTMLCanvasElement) => {
					const rgba = canvas
						.getContext("2d")
						?.getImageData(0, 0, canvas.width, canvas.height).data;
					return rgba
						? rgba.some((value, index) => index % 4 !== 3 && value > 10)
						: false;
				}),
			{ timeout: 30_000 }
		)
		.toBe(true);
}

test.describe("QCut independent Metal filter", () => {
	test.skip(
		!enabled,
		"Opt in with a local 1s 720p/30fps video and verified local Fog LUT"
	);
	// biome-ignore lint/correctness/noEmptyPattern: isolated real Electron process.
	test("applies, previews, changes intensity, exports and reloads without native filter fallback", async ({}, testInfo) => {
		test.setTimeout(300_000);
		const profile = await mkdtemp(join(tmpdir(), "qcut-independent-e2e-"));
		const evidence =
			process.env.QCUT_INDEPENDENT_FILTER_EVIDENCE ??
			testInfo.outputPath("evidence");
		await mkdir(evidence, { recursive: true });
		const app = await electron.launch({
			args: [`--user-data-dir=${profile}`, "dist/electron/main.js"],
			cwd: process.cwd(),
			env: { ...process.env, NODE_ENV: "test", QCUT_API_PORT: "0" },
		});
		const page = await app.firstWindow();
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		try {
			await page.waitForLoadState("domcontentloaded");
			await page.waitForFunction(() =>
				Boolean(document.querySelector("#root")?.children.length)
			);
			await app.evaluate(({ BrowserWindow }) => {
				BrowserWindow.getAllWindows()[0]?.setSize(1440, 1000);
			});
			await page.evaluate(() =>
				localStorage.setItem("hasSeenOnboarding", "true")
			);
			await navigateToProjects(page);
			await createTestProject(page, "Independent Metal E2E");
			await uploadTestMedia(page, source);
			const media = page.getByTestId("media-item").first();
			await expect(media).toBeVisible();
			await media.hover();
			await media.locator("button").first().click({ force: true });
			const clip = page.locator(
				'[data-testid="timeline-track"][data-track-type="media"] [data-testid="timeline-element"]'
			);
			await expect(clip).toHaveCount(1);
			await clip.click();
			await page.getByTestId("filters-panel-tab").click();
			await page
				.getByRole("button", { name: "滤镜实验室", exact: true })
				.click();
			await page.getByRole("tab", { name: "QCut Metal", exact: true }).click();
			const shelf = page.getByTestId("independent-filter-shelf");
			await expect(
				shelf.getByRole("button", { name: "应用 迷雾 QCut Metal" })
			).toBeEnabled({ timeout: 30_000 });
			await shelf.getByRole("button", { name: "应用 迷雾 QCut Metal" }).click();
			await expect
				.poll(() => readEffect({ page }))
				.toMatchObject({
					enabled: true,
					intensity: 100,
					nativeEffect: { provider: "qcut-metal-fog-v1" },
				});
			await trimTimelineToOneSecond({ page });
			await expectRenderedPreview({ page });
			await page.screenshot({ path: join(evidence, "01-qcut-metal-100.png") });
			await page
				.getByTestId("preview-capture-surface")
				.screenshot({ path: join(evidence, "preview-100.png") });
			const filtered = await exportAndVerifyMovingVideo({
				electronApp: app,
				page,
				filePath: join(evidence, "editor-metal-100.mp4"),
			});
			const slider = shelf.getByRole("slider");
			await slider.focus();
			await slider.press("Home");
			await expect
				.poll(() => readEffect({ page }))
				.toMatchObject({ intensity: 0 });
			await page.screenshot({ path: join(evidence, "02-qcut-metal-zero.png") });
			await page
				.getByTestId("preview-capture-surface")
				.screenshot({ path: join(evidence, "preview-zero.png") });
			const original = await exportAndVerifyMovingVideo({
				electronApp: app,
				page,
				filePath: join(evidence, "editor-metal-zero.mp4"),
			});
			expect(filtered.frameHashes).not.toEqual(original.frameHashes);
			await slider.focus();
			await slider.press("End");
			await expect
				.poll(() => readEffect({ page }))
				.toMatchObject({ intensity: 100 });
			await page.getByRole("tab", { name: "剪映本机", exact: true }).click();
			await expect(
				page.getByRole("searchbox", { name: "搜索剪映滤镜目录" })
			).toBeVisible();
			await page.getByRole("tab", { name: "QCut Metal", exact: true }).click();
			await expect
				.poll(() => readEffect({ page }))
				.toMatchObject({ nativeEffect: { provider: "qcut-metal-fog-v1" } });
			const lutExports = [];
			const graphTest = process.env.QCUT_INDEPENDENT_GRAPH_E2E === "1";
			if (process.env.QCUT_INDEPENDENT_LUT_E2E === "1" || graphTest) {
				const library = page.getByTestId("independent-lut-library");
				await expect(library.getByRole("status")).toContainText("本地滤镜", {
					timeout: 60_000,
				});
				const cards = await page.evaluate(
					async () =>
						(await window.electronAPI!.qcutIndependentFilter!.list()).cards
				);
				const selected = graphTest
					? ["sharpen", "vignette", "soften", "direct"].map(
							(kind) => cards.find((card) => card.independentKind === kind)!
						)
					: [
							cards.find((card) => card.implementation === "single-lut")!,
							cards.find((card) => card.tiledRendererKind === "tiled-lut-8x8")!,
							cards.find(
								(card) =>
									card.implementation === "single-lut" &&
									card.categories.includes("黑白")
							)!,
						];
				expect(selected.every(Boolean)).toBe(true);
				await library.getByRole("button", { name: "下一页 LUT" }).click();
				await expect(
					library.getByRole("button", { name: "上一页 LUT" })
				).toBeEnabled();
				await library.getByRole("button", { name: "上一页 LUT" }).click();
				await library.getByRole("searchbox").scrollIntoViewIfNeeded();
				await expect
					.poll(() => library.locator("img").count(), { timeout: 30_000 })
					.toBeGreaterThan(2);
				await page.screenshot({
					path: join(evidence, "lut-catalog-overview.png"),
				});
				for (const [index, card] of selected.entries()) {
					await library.getByRole("searchbox").fill(card.resourceId);
					await library
						.getByRole("combobox")
						.selectOption(card.categories[0] ?? "");
					await library
						.getByRole("button", {
							name: `应用 ${card.title} QCut Metal`,
							exact: true,
						})
						.click();
					await expect
						.poll(() => readEffect({ page }), { timeout: 60_000 })
						.toMatchObject({
							nativeEffect: {
								provider: graphTest
									? "qcut-metal-graph-v1"
									: "qcut-metal-lut-v1",
								resourceId: card.resourceId,
							},
							intensity: 100,
						});
					await expectRenderedPreview({ page });
					await page.screenshot({
						path: join(evidence, `lut-${index + 1}-preview.png`),
					});
					const video = await exportAndVerifyMovingVideo({
						electronApp: app,
						page,
						filePath: join(evidence, `lut-${index + 1}-export.mp4`),
					});
					expect(video.frameHashes).not.toEqual(original.frameHashes);
					lutExports.push({
						resourceId: card.resourceId,
						title: card.title,
						video,
					});
					await library.getByRole("combobox").selectOption("");
				}
				const url = page.url();
				await navigateToProjects(page);
				await page.goto(url);
				await expect
					.poll(() => readEffect({ page }), { timeout: 30_000 })
					.toMatchObject({
						nativeEffect: {
							provider: graphTest ? "qcut-metal-graph-v1" : "qcut-metal-lut-v1",
							resourceId: selected.at(-1)!.resourceId,
						},
					});
				await expectRenderedPreview({ page });
				await page.screenshot({
					path: join(evidence, "lut-project-reopened.png"),
				});
				await page.getByTestId("filters-panel-tab").click();
				await page
					.getByRole("button", { name: "滤镜实验室", exact: true })
					.click();
				await page
					.getByRole("tab", { name: "QCut Metal", exact: true })
					.click();
				await shelf
					.getByRole("button", { name: "应用 迷雾 QCut Metal" })
					.click();
				await expect
					.poll(() => readEffect({ page }))
					.toMatchObject({ nativeEffect: { provider: "qcut-metal-fog-v1" } });
			}
			const projectUrl = page.url();
			await navigateToProjects(page);
			await page.goto(projectUrl);
			await expect
				.poll(() => readEffect({ page }), { timeout: 30_000 })
				.toMatchObject({
					intensity: 100,
					nativeEffect: { provider: "qcut-metal-fog-v1" },
				});
			await expectRenderedPreview({ page });
			await page.screenshot({
				path: join(evidence, "03-project-reopened.png"),
			});
			const hashes = await Promise.all(
				["preview-100.png", "preview-zero.png"].map(async (name) =>
					createHash("sha256")
						.update(await readFile(join(evidence, name)))
						.digest("hex")
				)
			);
			expect(hashes[0]).not.toBe(hashes[1]);
			await app.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("qcut-independent-filter:render");
				ipcMain.handle("qcut-independent-filter:render", () => {
					throw new Error("Intentional Metal failure (E2E)");
				});
			});
			await page.reload();
			await expect(
				page.getByText("QCut Metal 渲染失败，预览未更新", { exact: true })
			).toBeVisible({ timeout: 30_000 });
			await page.screenshot({
				path: join(evidence, "04-preview-failure-visible.png"),
			});
			const failedOutput = join(evidence, "must-not-export.mp4");
			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = async () => ({ canceled: false, filePath });
			}, failedOutput);
			await page.getByTestId("export-button").click();
			await page.getByTestId("export-start-button").click();
			await expect(
				page.getByTestId("export-dialog").getByText(/Intentional Metal failure/)
			).toBeVisible({ timeout: 30_000 });
			expect(existsSync(failedOutput)).toBe(false);
			await page.screenshot({
				path: join(evidence, "05-export-failure-visible.png"),
			});
			expect(errors).toEqual([]);
			await writeFile(
				join(evidence, "editor-evidence.json"),
				JSON.stringify(
					{
						filtered,
						lutExports,
						original,
						previewHashes: hashes,
						reopened: await readEffect({ page }),
						reopenedPreviewRendered: true,
						pageErrors: errors,
						injectedFailure: {
							previewWarning: true,
							exportRejected: true,
							outputCreated: false,
						},
					},
					null,
					2
				)
			);
		} catch (error) {
			await page
				.screenshot({ path: join(evidence, "failure.png") })
				.catch(() => {});
			await writeFile(
				join(evidence, "failure-dom.txt"),
				await page
					.locator("body")
					.innerText()
					.catch(() => "")
			);
			throw error;
		} finally {
			await app.close();
			await rm(profile, { recursive: true, force: true });
		}
	});
});
