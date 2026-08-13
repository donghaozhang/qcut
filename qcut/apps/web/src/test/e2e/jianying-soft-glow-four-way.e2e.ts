import { existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
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
	navigateToProjects,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const RESOURCE_ID = "7447126702137904420";
const VERSION = "9673f80b8e2f5a07f02f9ce1130b784a";
const TITLE = "电影柔光";
const packagePath = join(
	homedir(),
	"Movies",
	"JianyingPro",
	"User Data",
	"Cache",
	"artistEffect",
	RESOURCE_ID,
	VERSION
);
const sourcePath = process.env.QCUT_JIANYING_SOFT_GLOW_SOURCE ?? "";
const enabled = Boolean(
	sourcePath && existsSync(sourcePath) && existsSync(packagePath)
);

function pngBytes({ dataUrl }: { dataUrl: string }) {
	const encoded = dataUrl.split(",", 2)[1];
	if (!encoded) throw new Error("Canvas did not return a PNG data URL");
	return Buffer.from(encoded, "base64");
}

async function addFirstMedia({ page }: { page: Page }) {
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

async function activeMultiPass({ page }: { page: Page }) {
	return page.evaluate(() => {
		const tracks = (
			window as unknown as {
				__timelineStore: {
					getState: () => {
						tracks: Array<{
							elements: Array<{
								type: string;
								color?: {
									multiPass?: {
										enabled: boolean;
										name: string;
										intensity: number;
										fidelity: string;
										nativeEffect?: {
											provider: string;
											resourceId: string;
											version: string;
										};
										passes?: Array<{ kind: string }>;
									};
								};
							}>;
						}>;
					};
				};
			}
		).__timelineStore.getState().tracks;
		return tracks
			.flatMap(({ elements }) => elements)
			.find(({ type }) => type === "adjustment")?.color?.multiPass;
	});
}

async function filteredCanvasPng({ page }: { page: Page }) {
	const canvas = page.getByTestId("color-preview-canvas").first();
	await expect(canvas).toBeVisible();
	return canvas.evaluate((element: HTMLCanvasElement) =>
		element.toDataURL("image/png")
	);
}

async function renderNativeFromPreviewBaseline({ page }: { page: Page }) {
	return page.evaluate(
		async ({ resourceId }) => {
			const canvas = document.querySelector<HTMLCanvasElement>(
				'[data-testid="color-preview-canvas"]'
			);
			const source = canvas?.parentElement?.querySelector<
				HTMLVideoElement | HTMLImageElement
			>("video[data-video-id], img");
			const api = window.electronAPI?.jianyingFilterLab;
			if (!canvas || !source || !api) {
				throw new Error(
					"QCut preview source or local filter API is unavailable"
				);
			}
			const fitted = document.createElement("canvas");
			fitted.width = canvas.width;
			fitted.height = canvas.height;
			const context = fitted.getContext("2d", { willReadFrequently: true });
			if (!context)
				throw new Error("QCut preview source canvas is unavailable");
			const sourceWidth =
				source instanceof HTMLVideoElement
					? source.videoWidth
					: source.naturalWidth;
			const sourceHeight =
				source instanceof HTMLVideoElement
					? source.videoHeight
					: source.naturalHeight;
			if (sourceWidth <= 0 || sourceHeight <= 0) {
				throw new Error("QCut preview source dimensions are unavailable");
			}
			const fitMode = getComputedStyle(source).objectFit;
			if (fitMode === "fill") {
				context.drawImage(source, 0, 0, fitted.width, fitted.height);
			} else {
				const scale =
					fitMode === "cover"
						? Math.max(fitted.width / sourceWidth, fitted.height / sourceHeight)
						: Math.min(
								fitted.width / sourceWidth,
								fitted.height / sourceHeight
							);
				const drawWidth = sourceWidth * scale;
				const drawHeight = sourceHeight * scale;
				context.drawImage(
					source,
					(fitted.width - drawWidth) / 2,
					(fitted.height - drawHeight) / 2,
					drawWidth,
					drawHeight
				);
			}
			const sourceFrame = context.getImageData(
				0,
				0,
				fitted.width,
				fitted.height
			);
			const request = {
				resourceId,
				width: fitted.width,
				height: fitted.height,
				intensity: 100,
				sourceKey: "soft-glow-four-way",
				timestampSeconds: 0,
				rgba: new Uint8Array(
					sourceFrame.data.buffer,
					sourceFrame.data.byteOffset,
					sourceFrame.data.byteLength
				),
			};
			const renderWhenAvailable = async ({
				remainingAttempts,
			}: {
				remainingAttempts: number;
			}): ReturnType<typeof api.renderLocalEffect> => {
				try {
					return await api.renderLocalEffect(request);
				} catch (error) {
					if (
						remainingAttempts <= 1 ||
						!String(error).includes("正在处理另一帧")
					) {
						throw error;
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
					return renderWhenAvailable({
						remainingAttempts: remainingAttempts - 1,
					});
				}
			};
			const result = await renderWhenAvailable({ remainingAttempts: 50 });
			const rendered = new Uint8ClampedArray(result.rgba);
			(
				window as unknown as {
					__qcutSoftGlowNativeEvidence?: {
						width: number;
						height: number;
						rgba: Uint8ClampedArray;
					};
				}
			).__qcutSoftGlowNativeEvidence = {
				width: result.width,
				height: result.height,
				rgba: rendered,
			};
			const output = document.createElement("canvas");
			output.width = result.width;
			output.height = result.height;
			output
				.getContext("2d")
				?.putImageData(
					new ImageData(rendered, result.width, result.height),
					0,
					0
				);
			return {
				provider: result.provider,
				resourceId: result.resourceId,
				width: result.width,
				height: result.height,
				sourcePng: fitted.toDataURL("image/png"),
				png: output.toDataURL("image/png"),
			};
		},
		{ resourceId: RESOURCE_ID }
	);
}

async function previewNativeDifference({ page }: { page: Page }) {
	return page.evaluate(() => {
		const canvas = document.querySelector<HTMLCanvasElement>(
			'[data-testid="color-preview-canvas"]'
		);
		const evidence = (
			window as unknown as {
				__qcutSoftGlowNativeEvidence?: {
					width: number;
					height: number;
					rgba: Uint8ClampedArray;
				};
			}
		).__qcutSoftGlowNativeEvidence;
		const context = canvas?.getContext("2d");
		if (!canvas || !context || !evidence) return null;
		if (canvas.width !== evidence.width || canvas.height !== evidence.height) {
			return { meanAbsoluteError: Number.POSITIVE_INFINITY, maximumError: 255 };
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
			meanAbsoluteError: absoluteError / channels,
			maximumError,
		};
	});
}

async function trimTimelineToOneSecond({ page }: { page: Page }) {
	await page.evaluate(() => {
		const state = (
			window as unknown as {
				__timelineStore: {
					getState: () => {
						tracks: Array<{
							id: string;
							elements: Array<{ id: string; type: string }>;
						}>;
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
				}
				if (element.type === "adjustment") {
					state.updateAdjustmentElement(
						track.id,
						element.id,
						{ duration: 1 },
						false
					);
				}
			}
		}
	});
}

test.describe("Jianying cinematic soft-glow four-way parity", () => {
	test.skip(
		!enabled,
		"Requires the pinned local effect package and source PNG"
	);

	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("captures QCut preview and export through the native provider", async ({}, testInfo) => {
		test.setTimeout(360_000);
		const evidenceDirectory =
			process.env.QCUT_JIANYING_SOFT_GLOW_EVIDENCE ??
			testInfo.outputPath("evidence");
		const profileDirectory = join(
			tmpdir(),
			`qcut-soft-glow-${process.pid}-${Date.now()}`
		);
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
			await page.evaluate(() =>
				localStorage.setItem("hasSeenOnboarding", "true")
			);
			await navigateToProjects(page);
			await createTestProject(page, "Cinematic Soft Glow Four Way");
			await uploadTestMedia(page, sourcePath);
			await addFirstMedia({ page });

			await page.getByTestId("adjustments-panel-tab").click();
			await page.getByRole("button", { name: "滤镜实验室" }).click();
			const lab = page.getByTestId("jianying-filter-lab");
			await expect(lab.getByText("高清黑白")).toBeVisible({ timeout: 30_000 });
			await lab
				.getByRole("searchbox", { name: "搜索剪映滤镜目录" })
				.fill(TITLE);
			const applyButton = lab.getByRole("button", {
				name: `应用 ${TITLE}`,
				exact: true,
			});
			await expect(applyButton).toBeVisible();
			await expect(applyButton.getByText("10 Pass")).toBeVisible();
			await applyButton.click();
			await expect
				.poll(() => activeMultiPass({ page }))
				.toMatchObject({
					name: TITLE,
					enabled: true,
					intensity: 100,
					fidelity: "native-local",
					nativeEffect: {
						provider: "jianying-local-effect-v1",
						resourceId: RESOURCE_ID,
						version: VERSION,
					},
				});

			await expect(
				page.getByTestId("color-preview-canvas").first()
			).toBeVisible();
			const nativePreview = await renderNativeFromPreviewBaseline({ page });
			expect(nativePreview).toMatchObject({
				provider: "jianying-local-effect-v1",
				resourceId: RESOURCE_ID,
			});
			await writeFile(
				join(evidenceDirectory, "qcut-preview-baseline.png"),
				pngBytes({ dataUrl: nativePreview.sourcePng })
			);
			await writeFile(
				join(evidenceDirectory, "qcut-preview-native-provider.png"),
				pngBytes({ dataUrl: nativePreview.png })
			);

			await expect
				.poll(
					async () =>
						(await previewNativeDifference({ page }))?.meanAbsoluteError ??
						Number.POSITIVE_INFINITY,
					{ timeout: 30_000 }
				)
				.toBeLessThan(2);
			const previewDifference = await previewNativeDifference({ page });
			await writeFile(
				join(evidenceDirectory, "qcut-preview-filtered.png"),
				pngBytes({ dataUrl: await filteredCanvasPng({ page }) })
			);
			await page.screenshot({
				path: join(evidenceDirectory, "qcut-preview-ui.png"),
				animations: "disabled",
			});

			await trimTimelineToOneSecond({ page });
			const exportPath = join(evidenceDirectory, "qcut-export.mp4");
			await rm(exportPath, { force: true });
			await electronApp.evaluate(async ({ dialog }, selectedPath) => {
				dialog.showSaveDialog = async () => ({
					canceled: false,
					filePath: selectedPath,
				});
			}, exportPath);
			await page.getByTestId("export-button").click();
			await expect(page.getByTestId("export-dialog")).toBeVisible();
			await page.getByTestId("export-quality-select").locator("button").click();
			await page.getByRole("radio", { name: "1280×720" }).click();
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
			await expect(page.getByTestId("export-start-button")).toBeVisible({
				timeout: 120_000,
			});
			const finalMultiPass = await activeMultiPass({ page });
			await writeFile(
				join(evidenceDirectory, "qcut-e2e.json"),
				`${JSON.stringify(
					{
						resourceId: RESOURCE_ID,
						version: VERSION,
						activeMultiPass: finalMultiPass
							? {
									name: finalMultiPass.name,
									enabled: finalMultiPass.enabled,
									intensity: finalMultiPass.intensity,
									fidelity: finalMultiPass.fidelity,
									nativeEffect: finalMultiPass.nativeEffect,
									passKinds: finalMultiPass.passes?.map(({ kind }) => kind),
								}
							: null,
						nativePreview: {
							provider: nativePreview.provider,
							resourceId: nativePreview.resourceId,
							width: nativePreview.width,
							height: nativePreview.height,
						},
						previewDifference,
						exportBytes: (await stat(exportPath)).size,
					},
					null,
					2
				)}\n`
			);
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
