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

import {
	expectPaintedCpu,
	installProviderProbe,
	previewPixelHash,
	readProbe,
	setPhase,
} from "./helpers/qcut-independent-soft-glow-probe";

const RESOURCE_ID = "7447126702137904420";
const VERSION = "9673f80b8e2f5a07f02f9ce1130b784a";
const PROVIDER = "qcut-cpu-soft-glow-ui-snapshot-v1";
const source = process.env.QCUT_INDEPENDENT_SOFT_GLOW_VIDEO ?? "";
const enabled =
	process.platform === "darwin" &&
	process.env.QCUT_INDEPENDENT_SOFT_GLOW_E2E === "1" &&
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

async function expectCpuPreview({
	page,
	intensity,
}: {
	page: Page;
	intensity: number;
}) {
	await expect
		.poll(() => readEffect({ page }), { timeout: 45_000 })
		.toMatchObject({
			enabled: true,
			intensity,
			nativeEffect: {
				provider: PROVIDER,
				resourceId: RESOURCE_ID,
				version: VERSION,
			},
		});
	const preview = page.getByTestId("color-preview-canvas").first();
	await expect(preview).toBeVisible({ timeout: 45_000 });
	await expect(preview).toHaveAttribute(
		"data-rendered-color-resources",
		`${RESOURCE_ID}:${intensity}`,
		{ timeout: 45_000 }
	);
}

test.describe("Independent C++ cinematic soft glow", () => {
	test.skip(
		!enabled,
		"Opt in with a local 1s 720p/30fps moving video and exact soft glow LUT"
	);
	// biome-ignore lint/correctness/noEmptyPattern: this test owns its isolated Electron process.
	test("applies CPU card, changes intensity, reopens and exports without native fallback", async ({}, testInfo) => {
		test.setTimeout(600_000);
		const profile = await mkdtemp(join(tmpdir(), "qcut-cpu-soft-glow-e2e-"));
		const evidence =
			process.env.QCUT_INDEPENDENT_SOFT_GLOW_EVIDENCE ??
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
			await app.evaluate(({ BrowserWindow }) =>
				BrowserWindow.getAllWindows()[0]?.setSize(1440, 1000)
			);
			await installProviderProbe({ app });
			await page.evaluate(() =>
				localStorage.setItem("hasSeenOnboarding", "true")
			);
			await navigateToProjects(page);
			await createTestProject(page, "Independent C++ Soft Glow E2E");
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
			const library = page.getByTestId("independent-lut-library");
			await library.getByRole("searchbox").fill(RESOURCE_ID);
			const card = library.getByRole("button", {
				name: "应用 电影柔光 QCut CPU",
				exact: true,
			});
			await expect(card).toBeEnabled({ timeout: 60_000 });
			await setPhase({ app, phase: "preview-100" });
			await card.click();
			await trimTimelineToOneSecond({ page });
			await expectCpuPreview({ page, intensity: 100 });
			const paintedFull = await expectPaintedCpu({ app, page, intensity: 100 });
			await page.screenshot({ path: join(evidence, "01-applied-cpu.png") });
			await page
				.getByTestId("preview-capture-surface")
				.screenshot({ path: join(evidence, "preview-100.png") });
			await setPhase({ app, phase: "export-100" });
			const full = await exportAndVerifyMovingVideo({
				electronApp: app,
				page,
				filePath: join(evidence, "cpu-100.mp4"),
			});
			const slider = library.getByRole("slider");
			await setPhase({ app, phase: "preview-0" });
			await slider.focus();
			await slider.press("Home");
			await expectCpuPreview({ page, intensity: 0 });
			const paintedZero = await expectPaintedCpu({ app, page, intensity: 0 });
			expect(
				(await readProbe({ app })).renders.some(
					(render) =>
						render.phase === "preview-0" &&
						render.intensity === 0 &&
						render.provider === PROVIDER
				)
			).toBe(true);
			await library
				.getByRole("button", { name: "A 原图", exact: true })
				.click();
			await expect
				.poll(() => readEffect({ page }))
				.toMatchObject({ enabled: false, intensity: 0 });
			await expect
				.poll(
					() =>
						previewPixelHash({
							page,
							width: paintedZero.width,
							height: paintedZero.height,
						}),
					{ timeout: 45_000 }
				)
				.toBe(paintedZero.inputSha256);
			await setPhase({ app, phase: "restored-0" });
			await library
				.getByRole("button", { name: "B 滤镜", exact: true })
				.click();
			await expectCpuPreview({ page, intensity: 0 });
			const paintedRestored = await expectPaintedCpu({
				app,
				page,
				intensity: 0,
			});
			expect(paintedRestored.canvasSha256).toBe(paintedZero.canvasSha256);
			await writeFile(
				join(evidence, "pixel-evidence.json"),
				JSON.stringify(
					{ full: paintedFull, zero: paintedZero, restored: paintedRestored },
					null,
					2
				)
			);
			await setPhase({ app, phase: "preview-37" });
			await slider.focus();
			await slider.press("PageUp");
			await slider.press("PageUp");
			await slider.press("PageUp");
			await slider.press("PageUp");
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");
			await slider.press("ArrowLeft");
			await expectCpuPreview({ page, intensity: 37 });
			await page
				.getByTestId("preview-capture-surface")
				.screenshot({ path: join(evidence, "preview-37.png") });
			const projectUrl = page.url();
			await navigateToProjects(page);
			await page.goto(projectUrl);
			await setPhase({ app, phase: "reopened-37" });
			await expectCpuPreview({ page, intensity: 37 });
			await page.screenshot({ path: join(evidence, "02-reopened-cpu-37.png") });
			await setPhase({ app, phase: "export-37" });
			const partial = await exportAndVerifyMovingVideo({
				electronApp: app,
				page,
				filePath: join(evidence, "cpu-37.mp4"),
			});
			expect(partial.frameHashes).not.toEqual(full.frameHashes);
			const probe = await readProbe({ app });
			expect(probe.nativeAttempts).toEqual([]);
			expect(probe.failures).toEqual([]);
			expect(probe.renders.length).toBeGreaterThan(0);
			expect(
				probe.renders.every(
					(render) =>
						render.provider === PROVIDER && render.resourceId === RESOURCE_ID
				)
			).toBe(true);
			for (const intensity of [100, 37]) {
				expect(
					probe.renders.some(
						(render) =>
							render.phase === `export-${intensity}` &&
							render.intensity === intensity
					)
				).toBe(true);
			}
			const previewHashes = await Promise.all(
				["preview-100.png", "preview-37.png"].map(async (name) =>
					createHash("sha256")
						.update(await readFile(join(evidence, name)))
						.digest("hex")
				)
			);
			expect(previewHashes[0]).not.toBe(previewHashes[1]);
			await app.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("qcut-independent-filter:render");
				ipcMain.handle("qcut-independent-filter:render", () => {
					throw new Error("Intentional independent CPU failure (E2E)");
				});
			});
			await page.reload();
			await expect(page.getByText(/渲染失败，预览未更新/)).toBeVisible({
				timeout: 45_000,
			});
			const failedOutput = join(evidence, "must-not-export.mp4");
			await app.evaluate(({ dialog }, filePath) => {
				dialog.showSaveDialog = async () => ({ canceled: false, filePath });
			}, failedOutput);
			await page.getByTestId("export-button").click();
			await page.getByTestId("export-start-button").click();
			await expect(
				page
					.getByTestId("export-dialog")
					.getByText(/Intentional independent CPU failure/)
			).toBeVisible({ timeout: 45_000 });
			expect(existsSync(failedOutput)).toBe(false);
			expect((await readProbe({ app })).nativeAttempts).toEqual([]);
			expect(errors).toEqual([]);
			await writeFile(
				join(evidence, "editor-evidence.json"),
				JSON.stringify(
					{
						provider: PROVIDER,
						resourceId: RESOURCE_ID,
						version: VERSION,
						source,
						full,
						partial,
						previewHashes,
						paintedPixels: {
							full: paintedFull,
							zero: paintedZero,
							restored: paintedRestored,
						},
						zeroOriginalComparison: {
							disabledShowsInput: true,
							restoredIntensity: 0,
						},
						reopened: await readEffect({ page }),
						probe,
						pageErrors: errors,
						failurePropagation: {
							previewVisible: true,
							exportRejected: true,
							nativeFallback: false,
						},
					},
					null,
					2
				)
			);
		} catch (error) {
			await writeFile(
				join(evidence, "page-errors.json"),
				JSON.stringify(errors, null, 2)
			);
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
			await writeFile(
				join(evidence, "provider-probe.json"),
				JSON.stringify(await readProbe({ app }).catch(() => null), null, 2)
			);
			throw error;
		} finally {
			await app.close();
			await rm(profile, { recursive: true, force: true });
		}
	});
});
