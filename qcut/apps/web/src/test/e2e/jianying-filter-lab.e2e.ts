import { existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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

async function nativePortraitPreviewStats({
	page,
	resourceId,
}: {
	page: Page;
	resourceId: string;
}) {
	return page.evaluate(
		async ({ resourceId: selectedResourceId }) => {
			type NativePortraitEvidenceWindow = Window & {
				__qcutJianyingNativePortraitEvidence?: {
					width: number;
					height: number;
					rgba: Uint8Array;
				};
			};
			const preview = document.querySelector<HTMLElement>(
				'[data-testid="preview-capture-surface"]'
			);
			const source = preview?.querySelector<HTMLVideoElement>(
				"video[data-video-id]"
			);
			if (
				!source?.parentElement ||
				source.videoWidth <= 0 ||
				source.videoHeight <= 0
			) {
				throw new Error("Preview source unavailable");
			}
			const scale = Math.min(1, 480 / source.parentElement.clientWidth);
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(
				1,
				Math.round(source.parentElement.clientWidth * scale)
			);
			canvas.height = Math.max(
				1,
				Math.round(source.parentElement.clientHeight * scale)
			);
			const context = canvas.getContext("2d", { willReadFrequently: true });
			const api = window.electronAPI?.jianyingFilterLab;
			if (!context || !api) throw new Error("Preview API unavailable");
			const fitMode = source.style.objectFit || "contain";
			if (fitMode === "fill") {
				context.drawImage(source, 0, 0, canvas.width, canvas.height);
			} else {
				const objectScale =
					fitMode === "cover"
						? Math.max(
								canvas.width / source.videoWidth,
								canvas.height / source.videoHeight
							)
						: Math.min(
								canvas.width / source.videoWidth,
								canvas.height / source.videoHeight
							);
				const drawWidth = source.videoWidth * objectScale;
				const drawHeight = source.videoHeight * objectScale;
				context.drawImage(
					source,
					(canvas.width - drawWidth) / 2,
					(canvas.height - drawHeight) / 2,
					drawWidth,
					drawHeight
				);
			}
			const frame = context.getImageData(0, 0, canvas.width, canvas.height);
			const rendered = await api.renderLocalPortrait({
				resourceId: selectedResourceId,
				width: canvas.width,
				height: canvas.height,
				sourceKey: `e2e:${source.dataset.videoId ?? selectedResourceId}`,
				timestampSeconds: source.currentTime,
				rgba: new Uint8Array(
					frame.data.buffer,
					frame.data.byteOffset,
					frame.data.byteLength
				),
			});
			(
				window as NativePortraitEvidenceWindow
			).__qcutJianyingNativePortraitEvidence = {
				width: rendered.width,
				height: rendered.height,
				rgba: new Uint8Array(rendered.rgba),
			};
			let signature = 0;
			let samples = 0;
			for (let index = 0; index < rendered.rgba.length; index += 388) {
				signature =
					(signature +
						rendered.rgba[index] * 3 +
						rendered.rgba[index + 1] * 5 +
						rendered.rgba[index + 2] * 7) %
					1_000_000_007;
				samples += 1;
			}
			return {
				provider: rendered.provider,
				resourceId: rendered.resourceId,
				maskWidth: rendered.mask.width,
				maskHeight: rendered.mask.height,
				samples,
				signature,
			};
		},
		{ resourceId }
	);
}

async function nativePortraitPreviewDifference({ page }: { page: Page }) {
	return page.evaluate(() => {
		type NativePortraitEvidenceWindow = Window & {
			__qcutJianyingNativePortraitEvidence?: {
				width: number;
				height: number;
				rgba: Uint8Array;
			};
		};
		const evidence = (window as NativePortraitEvidenceWindow)
			.__qcutJianyingNativePortraitEvidence;
		const canvas = document.querySelector<HTMLCanvasElement>(
			'[data-testid="color-preview-canvas"]'
		);
		const context = canvas?.getContext("2d");
		if (!evidence || !canvas || !context) return null;
		if (canvas.width !== evidence.width || canvas.height !== evidence.height) {
			return {
				width: canvas.width,
				height: canvas.height,
				meanAbsoluteError: Number.POSITIVE_INFINITY,
				maximumError: 255,
			};
		}
		const actual = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let absoluteError = 0;
		let maximumError = 0;
		let channels = 0;
		for (let index = 0; index < actual.length; index += 4) {
			for (let channel = 0; channel < 3; channel += 1) {
				const error = Math.abs(
					actual[index + channel] - evidence.rgba[index + channel]
				);
				absoluteError += error;
				maximumError = Math.max(maximumError, error);
				channels += 1;
			}
		}
		return {
			width: canvas.width,
			height: canvas.height,
			meanAbsoluteError: absoluteError / channels,
			maximumError,
		};
	});
}

type TestLut = {
	name?: string;
	enabled?: boolean;
	intensity?: number;
	cube?: { size: number; values: number[] };
	dual?: {
		maskKind?: string;
		resourceId?: string;
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
			resourceId: lut?.dual?.resourceId,
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
		test.setTimeout(180_000);
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
			const localRuntime = await page.evaluate(() =>
				window.electronAPI?.jianyingFilterLab?.inspectLocalRuntime({
					refresh: true,
				})
			);
			expect(localRuntime).toMatchObject({
				state: "ready",
				provider: "jianying-local-effect-v1",
				bridgeReady: true,
				runtimeReady: true,
				modelReady: true,
			});
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
			await controls.getByRole("button", { name: "A 原图" }).click();
			await expect
				.poll(async () => (await adjustmentLutState({ page })).enabled)
				.toBe(false);
			const nativePortraitStats = await nativePortraitPreviewStats({
				page,
				resourceId: "7361792068475325735",
			});
			expect(nativePortraitStats).toMatchObject({
				provider: "jianying-local-effect-v1",
				resourceId: "7361792068475325735",
				maskWidth: 224,
				maskHeight: 128,
			});

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
					maskKind: "skin-segmentation-v1",
					resourceId: "7361792068475325735",
					enabled: true,
				});
			await expect
				.poll(
					async () =>
						(await nativePortraitPreviewDifference({ page }))
							?.meanAbsoluteError ?? Number.POSITIVE_INFINITY,
					{ timeout: 30_000 }
				)
				.toBeLessThan(2);
			const nativeDifference = await nativePortraitPreviewDifference({ page });
			expect(nativeDifference).toMatchObject({
				width: expect.any(Number),
				height: expect.any(Number),
				maximumError: expect.any(Number),
			});
			const dualFilteredStats = await filteredPreviewStats({ page });
			await expect(
				page.getByText("本机剪映人像运行时不可用，已使用近似肤色蒙版")
			).toHaveCount(0);
			await page.screenshot({
				path: join(evidenceDirectory, "04-olympus-dual-lut-applied.png"),
				animations: "disabled",
			});
			await writeFile(
				join(evidenceDirectory, "native-portrait-evidence.json"),
				`${JSON.stringify(
					{
						localRuntime,
						nativePortraitStats,
						nativeDifference,
					},
					null,
					2
				)}\n`,
				"utf8"
			);

			const qinghuiPortraitStats = await nativePortraitPreviewStats({
				page,
				resourceId: "7127671508264078599",
			});
			expect(qinghuiPortraitStats).toMatchObject({
				provider: "jianying-local-effect-v1",
				resourceId: "7127671508264078599",
				maskWidth: 224,
				maskHeight: 128,
			});
			const qinghuiButton = await findFilter({ lab, title: "青灰" });
			await expect(qinghuiButton.getByText("双 LUT")).toBeVisible();
			await qinghuiButton.click();
			await expect
				.poll(() => adjustmentLutState({ page }))
				.toMatchObject({
					name: "青灰",
					size: 64,
					skinSize: 64,
					maskKind: "skin-segmentation-v1",
					resourceId: "7127671508264078599",
					enabled: true,
				});
			await expect
				.poll(
					async () =>
						(await nativePortraitPreviewDifference({ page }))
							?.meanAbsoluteError ?? Number.POSITIVE_INFINITY,
					{ timeout: 30_000 }
				)
				.toBeLessThan(2);
			const qinghuiDifference = await nativePortraitPreviewDifference({ page });
			await page.screenshot({
				path: join(evidenceDirectory, "05-qinghui-native-portrait.png"),
				animations: "disabled",
			});

			await page.evaluate(() => {
				const state = (
					window as unknown as {
						__timelineStore: {
							getState: () => {
								tracks: Array<{
									id: string;
									elements: Array<{ id: string; type: string }>;
								}>;
								updateElementDuration: (
									trackId: string,
									elementId: string,
									duration: number,
									recordHistory: boolean
								) => void;
								updateMediaElement: (
									trackId: string,
									elementId: string,
									updates: { duration: number },
									recordHistory: boolean
								) => void;
								updateAdjustmentElement: (
									trackId: string,
									elementId: string,
									updates: { duration: number },
									recordHistory: boolean
								) => void;
							};
						};
					}
				).__timelineStore.getState();
				for (const track of state.tracks) {
					for (const element of track.elements) {
						if (element.type === "media") {
							state.updateMediaElement(
								track.id,
								element.id,
								{ duration: 1 },
								false
							);
							continue;
						}
						if (element.type === "adjustment") {
							state.updateAdjustmentElement(
								track.id,
								element.id,
								{ duration: 1 },
								false
							);
							continue;
						}
						state.updateElementDuration(track.id, element.id, 1, false);
					}
				}
			});
			await expect
				.poll(() =>
					page.evaluate(() => {
						const tracks = (
							window as unknown as {
								__timelineStore: TestTimelineStore;
							}
						).__timelineStore.getState().tracks;
						return Math.max(
							0,
							...tracks.flatMap(({ elements }) =>
								elements.map(
									(element) =>
										((element as { startTime?: number }).startTime ?? 0) +
										((element as { duration?: number }).duration ?? 0)
								)
							)
						);
					})
				)
				.toBe(1);
			const exportPath = join(evidenceDirectory, "qinghui-native-export.mp4");
			await rm(exportPath, { force: true });
			await electronApp.evaluate(async ({ dialog }, selectedPath) => {
				dialog.showSaveDialog = async () => ({
					canceled: false,
					filePath: selectedPath,
				});
			}, exportPath);
			await page.getByTestId("export-button").click();
			await expect(page.getByTestId("export-dialog")).toBeVisible();
			const includeAudio = page.getByRole("checkbox", {
				name: "Include audio in export",
			});
			if (
				(await includeAudio.count()) > 0 &&
				(await includeAudio.isChecked())
			) {
				await includeAudio.click();
			}
			await page.getByTestId("export-start-button").click();
			await expect
				.poll(
					async () => {
						try {
							return (await stat(exportPath)).size;
						} catch {
							return 0;
						}
					},
					{ timeout: 120_000, intervals: [500, 1_000, 2_000] }
				)
				.toBeGreaterThan(1_000);
			const exportSize = (await stat(exportPath)).size;
			await writeFile(
				join(evidenceDirectory, "native-portrait-evidence.json"),
				`${JSON.stringify(
					{
						localRuntime,
						nativePortraitStats,
						nativeDifference,
						qinghuiPortraitStats,
						qinghuiDifference,
						exportSize,
					},
					null,
					2
				)}\n`,
				"utf8"
			);
			await page.getByRole("button", { name: "Close export dialog" }).click();

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
				path: join(evidenceDirectory, "06-shader-favorites-recent.png"),
				animations: "disabled",
			});
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
