import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const sourcePath = process.env.QCUT_REAL_PORTRAIT_IMAGE_PATH;
const multiFaceSourcePath = process.env.QCUT_REAL_MULTIFACE_IMAGE_PATH;
const matureFaceSourcePath = process.env.QCUT_REAL_MATURE_PORTRAIT_IMAGE_PATH;
const outputDirectory = path.resolve(
	"output/playwright/jianying-portrait-adjustment"
);
const exportPath = path.join(outputDirectory, "portrait-adjustment-export.mp4");

interface PortraitHarnessWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				type: string;
				isMain?: boolean;
				elements: Array<{
					id: string;
					portraitAdjustments?: {
						enabled: boolean;
						values: Record<string, number>;
						faceTarget?: { mode: "all" | "single"; faceId?: number };
						makeup?: Record<string, { cardId: string; intensity: number }>;
						faces?: Array<{
							trackId: number;
							personBindingId?: string;
							bindingAnchor?: {
								rect: {
									x: number;
									y: number;
									width: number;
									height: number;
								};
								frameNumber?: number;
							};
							values: Record<string, number>;
							makeup?: Record<string, { cardId: string; intensity: number }>;
						}>;
					};
				}>;
			}>;
			addElementToTrack: (
				trackId: string,
				element: Record<string, unknown>
			) => string | null;
			updateMediaElement: (
				trackId: string,
				elementId: string,
				updates: Record<string, unknown>,
				pushHistory?: boolean
			) => void;
			setSelectedElements: (
				selection: Array<{ trackId: string; elementId: string }>
			) => void;
		};
	};
}

function runQCutCLI({ args }: { args: string[] }) {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		execFile(
			"bun",
			["--silent", "run", "qcut", "--", ...args],
			{
				cwd: path.resolve("."),
				env: process.env,
				maxBuffer: 4 * 1024 * 1024,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(`QCut CLI failed: ${stderr || stdout || error.message}`)
					);
					return;
				}
				resolve({ stdout, stderr });
			}
		);
	});
}

async function addImportedPortraitToTimeline({ page }: { page: Page }) {
	return page.evaluate(() => {
		const harness = window as unknown as PortraitHarnessWindow;
		const media = harness.__mediaStore.getState().mediaItems[0];
		const timeline = harness.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		if (!media || !track) throw new Error("Expected imported portrait media");
		const elementId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: media.id,
			name: media.name,
			duration: 1,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!elementId) throw new Error("Failed to add portrait media");
		timeline.setSelectedElements([{ trackId: track.id, elementId }]);
		return { elementId, trackId: track.id };
	});
}

async function readPortraitAdjustments({
	page,
	clip,
}: {
	page: Page;
	clip: { elementId: string; trackId: string };
}) {
	return page.evaluate(({ trackId, elementId }) => {
		const timeline = (
			window as unknown as PortraitHarnessWindow
		).__timelineStore.getState();
		return timeline.tracks
			.find((track) => track.id === trackId)
			?.elements.find((element) => element.id === elementId)
			?.portraitAdjustments;
	}, clip);
}

async function canvasHash({ page }: { page: Page }) {
	return page.getByTestId("color-preview-canvas").evaluate((canvasNode) => {
		const canvas = canvasNode as HTMLCanvasElement;
		const pixels = canvas
			.getContext("2d", { willReadFrequently: true })
			?.getImageData(0, 0, canvas.width, canvas.height).data;
		if (!pixels) return { hash: 0, opaque: 0 };
		let hash = 2166136261;
		let opaque = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			hash ^= pixels[index];
			hash = Math.imul(hash, 16777619);
			hash ^= pixels[index + 1];
			hash = Math.imul(hash, 16777619);
			hash ^= pixels[index + 2];
			hash = Math.imul(hash, 16777619);
			if (pixels[index + 3] > 0) opaque += 1;
		}
		return { hash: hash >>> 0, opaque };
	});
}

async function canvasHalfHashes({ page }: { page: Page }) {
	return page.evaluate(() => {
		const root = Array.from(
			document.querySelectorAll<HTMLElement>("[data-preview-element-id]")
		).find((candidate) =>
			candidate.querySelector(
				'img[data-color-source="true"], video[data-video-id]'
			)
		);
		const renderedCanvas = root?.querySelector<HTMLCanvasElement>(
			'[data-testid="color-preview-canvas"]'
		);
		if (!root) return { left: 0, right: 0, opaque: 0, visible: 0 };
		const rootRect = root.getBoundingClientRect();
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(rootRect.width);
		canvas.height = Math.round(rootRect.height);
		const drawContext = canvas.getContext("2d", { willReadFrequently: true });
		if (!drawContext || canvas.width <= 0 || canvas.height <= 0) {
			return { left: 0, right: 0, opaque: 0, visible: 0 };
		}
		if (renderedCanvas) {
			drawContext.drawImage(renderedCanvas, 0, 0, canvas.width, canvas.height);
		} else {
			const image = root.querySelector<HTMLImageElement>(
				'img[data-color-source="true"]'
			);
			if (!image?.complete) {
				return { left: 0, right: 0, opaque: 0, visible: 0 };
			}
			if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
				return { left: 0, right: 0, opaque: 0, visible: 0 };
			}
			const objectFit = getComputedStyle(image).objectFit;
			const scale =
				objectFit === "cover"
					? Math.max(
							canvas.width / image.naturalWidth,
							canvas.height / image.naturalHeight
						)
					: Math.min(
							canvas.width / image.naturalWidth,
							canvas.height / image.naturalHeight
						);
			const drawWidth =
				objectFit === "fill" ? canvas.width : image.naturalWidth * scale;
			const drawHeight =
				objectFit === "fill" ? canvas.height : image.naturalHeight * scale;
			drawContext.drawImage(
				image,
				(canvas.width - drawWidth) / 2,
				(canvas.height - drawHeight) / 2,
				drawWidth,
				drawHeight
			);
		}
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return { left: 0, right: 0, opaque: 0, visible: 0 };
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		const middle = Math.floor(canvas.width / 2);
		let left = 2166136261;
		let right = 2166136261;
		let opaque = 0;
		let visible = 0;
		for (let y = 0; y < canvas.height; y += 1) {
			for (let x = 0; x < canvas.width; x += 1) {
				const index = (y * canvas.width + x) * 4;
				let hash = x < middle ? left : right;
				for (let channel = 0; channel < 3; channel += 1) {
					hash ^= pixels[index + channel];
					hash = Math.imul(hash, 16777619);
				}
				if (x < middle) left = hash;
				else right = hash;
				if (pixels[index + 3] > 0) opaque += 1;
				if (
					pixels[index + 3] > 0 &&
					pixels[index] + pixels[index + 1] + pixels[index + 2] > 12
				) {
					visible += 1;
				}
			}
		}
		return { left: left >>> 0, right: right >>> 0, opaque, visible };
	});
}

async function storeCanvasBaseline({ page }: { page: Page }) {
	await page.getByTestId("color-preview-canvas").evaluate((canvasNode) => {
		const canvas = canvasNode as HTMLCanvasElement;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Canvas context unavailable");
		const baselineWindow = window as typeof window & {
			__portraitPixelBaseline?: {
				width: number;
				height: number;
				pixels: Uint8ClampedArray;
			};
		};
		baselineWindow.__portraitPixelBaseline = {
			width: canvas.width,
			height: canvas.height,
			pixels: new Uint8ClampedArray(
				context.getImageData(0, 0, canvas.width, canvas.height).data
			),
		};
	});
}

async function canvasDifferenceFromBaseline({ page }: { page: Page }) {
	return page.getByTestId("color-preview-canvas").evaluate((canvasNode) => {
		const canvas = canvasNode as HTMLCanvasElement;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		const baselineWindow = window as typeof window & {
			__portraitPixelBaseline?: {
				width: number;
				height: number;
				pixels: Uint8ClampedArray;
			};
		};
		const baseline = baselineWindow.__portraitPixelBaseline;
		if (
			!context ||
			!baseline ||
			baseline.width !== canvas.width ||
			baseline.height !== canvas.height
		) {
			throw new Error(
				"Canvas baseline unavailable or has different dimensions"
			);
		}
		const current = context.getImageData(
			0,
			0,
			canvas.width,
			canvas.height
		).data;
		const middle = Math.floor(canvas.width / 2);
		let leftAbsolute = 0;
		let rightAbsolute = 0;
		let leftChangedPixels = 0;
		let rightChangedPixels = 0;
		for (let y = 0; y < canvas.height; y += 1) {
			for (let x = 0; x < canvas.width; x += 1) {
				const index = (y * canvas.width + x) * 4;
				let pixelDifference = 0;
				for (let channel = 0; channel < 3; channel += 1) {
					pixelDifference += Math.abs(
						current[index + channel] - baseline.pixels[index + channel]
					);
				}
				if (x < middle) {
					leftAbsolute += pixelDifference;
					if (pixelDifference > 0) leftChangedPixels += 1;
				} else {
					rightAbsolute += pixelDifference;
					if (pixelDifference > 0) rightChangedPixels += 1;
				}
			}
		}
		return {
			leftAbsolute,
			leftChangedPixels,
			rightAbsolute,
			rightChangedPixels,
		};
	});
}

async function waitForCanvasChange({
	page,
	previousHash,
}: {
	page: Page;
	previousHash: number;
}) {
	let settled: Awaited<ReturnType<typeof canvasHash>> | undefined;
	await expect
		.poll(
			async () => {
				const current = await canvasHash({ page });
				if (current.opaque > 10_000 && current.hash !== previousHash) {
					settled = current;
				}
				return settled !== undefined;
			},
			{ timeout: 30_000 }
		)
		.toBe(true);
	if (!settled) throw new Error("Expected a nonblank changed preview frame");
	return settled;
}

async function waitForPortraitCanvasChange({
	page,
	previousHash,
}: {
	page: Page;
	previousHash: number;
}) {
	const fallbackToast = portraitFallbackToast({ page });
	await Promise.race([
		waitForCanvasChange({ page, previousHash }),
		fallbackToast
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(async () => {
				throw new Error(
					(await fallbackToast.textContent()) ?? "人像预览已降级"
				);
			}),
	]);
}

function portraitFallbackToast({ page }: { page: Page }) {
	return page
		.locator("[data-sonner-toast]")
		.filter({ hasText: "本机剪映美颜美体运行时不可用" });
}

async function waitForHalfPreviewChange({
	page,
	previous,
}: {
	page: Page;
	previous: Awaited<ReturnType<typeof canvasHalfHashes>>;
}) {
	let settled: Awaited<ReturnType<typeof canvasHalfHashes>> | undefined;
	await expect
		.poll(
			async () => {
				const current = await canvasHalfHashes({ page });
				if (
					current.visible > 10_000 &&
					(current.left !== previous.left || current.right !== previous.right)
				) {
					settled = current;
				}
				return settled !== undefined;
			},
			{ timeout: 30_000 }
		)
		.toBe(true);
	if (!settled) throw new Error("Expected a changed nonblank preview frame");
	return settled;
}

async function waitForCanvasHash({
	page,
	expectedHash,
}: {
	page: Page;
	expectedHash: number;
}) {
	let settled: Awaited<ReturnType<typeof canvasHash>> | undefined;
	await expect
		.poll(
			async () => {
				const current = await canvasHash({ page });
				if (current.opaque > 10_000 && current.hash === expectedHash) {
					settled = current;
				}
				return settled !== undefined;
			},
			{ timeout: 30_000 }
		)
		.toBe(true);
	if (!settled) throw new Error("Expected the restored nonblank preview frame");
	return settled;
}

async function setAdjustment({
	page,
	label,
	value,
}: {
	page: Page;
	label: string;
	value: number;
}) {
	const input = page.getByLabel(`${label}数值`, { exact: true });
	await input.fill(String(value));
	await input.press("Tab");
}

async function openPortraitGroup({
	label,
	panel,
}: {
	label: string;
	panel: Locator;
}) {
	const trigger = panel.getByRole("button", { name: label, exact: true });
	if ((await trigger.getAttribute("aria-expanded")) !== "true") {
		await trigger.click();
	}
	await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

async function selectFeatureCategory({
	page,
	name,
}: {
	page: Page;
	name: string;
}) {
	await page
		.getByTestId("portrait-section-features")
		.getByRole("button", {
			name,
			exact: true,
		})
		.click();
}

test.describe("Jianying binary portrait adjustment", () => {
	test.skip(
		!sourcePath || !existsSync(sourcePath),
		"Set QCUT_REAL_PORTRAIT_IMAGE_PATH to a clothed real-person image"
	);

	test("expands portrait groups independently", async ({ page }) => {
		test.setTimeout(120_000);
		if (!sourcePath) throw new Error("Missing real portrait image path");
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Portrait Collapsible Groups E2E");
		await uploadTestMedia(page, sourcePath);
		await addImportedPortraitToTimeline({ page });

		const properties = page.getByTestId("media-properties");
		await properties
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		const panel = page.getByTestId("jianying-portrait-adjustments");
		await expect(panel).toBeVisible();
		await expect(
			page.getByTestId("jianying-portrait-runtime-status")
		).toContainText("就绪", { timeout: 30_000 });

		const labels = ["皮肤管理", "脸型", "五官精修", "美妆", "手动精修"];
		for (const label of labels) {
			await expect(
				panel.getByRole("button", { name: label, exact: true })
			).toHaveAttribute("aria-expanded", "false");
		}
		await page.screenshot({
			path: path.join(outputDirectory, "01a-collapsible-groups.png"),
			animations: "disabled",
		});

		await openPortraitGroup({ panel, label: "皮肤管理" });
		await openPortraitGroup({ panel, label: "五官精修" });
		await expect(page.getByTestId("portrait-section-skin")).toBeVisible();
		await expect(page.getByTestId("portrait-section-features")).toBeVisible();

		await panel.getByRole("button", { name: "皮肤管理", exact: true }).click();
		await expect(
			panel.getByRole("button", { name: "皮肤管理", exact: true })
		).toHaveAttribute("aria-expanded", "false");
		await expect(page.getByTestId("portrait-section-skin")).not.toBeVisible();
		await expect(
			panel.getByRole("button", { name: "五官精修", exact: true })
		).toHaveAttribute("aria-expanded", "true");
		await page.screenshot({
			path: path.join(outputDirectory, "01b-independent-expanded-group.png"),
			animations: "disabled",
		});
	});

	test("drives native retouch, makeup, targeting, presets, and export", async ({
		electronApp,
		page,
	}) => {
		if (!sourcePath) throw new Error("Missing real portrait image path");
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Jianying Portrait Adjustment E2E");
		await uploadTestMedia(page, sourcePath);
		const clip = await addImportedPortraitToTimeline({ page });

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();
		await properties
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		const panel = page.getByTestId("jianying-portrait-adjustments");
		await expect(panel).toBeVisible();
		await expect(
			page.getByTestId("jianying-portrait-runtime-status")
		).toContainText("就绪", { timeout: 30_000 });
		await page.screenshot({
			path: path.join(outputDirectory, "01-basic-offline-ready.png"),
			animations: "disabled",
		});

		await panel.getByRole("switch", { name: "启用原版美颜美体" }).click();
		await panel.getByRole("tab", { name: "美颜", exact: true }).click();
		for (const label of ["皮肤管理", "脸型", "五官精修", "美妆", "手动精修"]) {
			await expect(
				panel.getByRole("button", { name: label, exact: true })
			).toHaveAttribute("aria-expanded", "false");
		}
		await page.screenshot({
			path: path.join(outputDirectory, "01a-collapsible-groups.png"),
			animations: "disabled",
		});
		await openPortraitGroup({ panel, label: "皮肤管理" });
		await expect(page.getByTestId("portrait-section-skin")).toBeVisible();
		await setAdjustment({ page, label: "磨皮", value: 65 });
		await setAdjustment({ page, label: "肤色", value: 1 });
		const previewCanvas = page.getByTestId("color-preview-canvas");
		await expect(previewCanvas).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const subtleSkinHash = await canvasHash({ page });
		await setAdjustment({ page, label: "肤色", value: 70 });
		await setAdjustment({ page, label: "冷暖", value: 20 });
		const skinHash = await waitForCanvasChange({
			page,
			previousHash: subtleSkinHash.hash,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "02-skin-tone-live-preview.png"),
			animations: "disabled",
		});
		await openPortraitGroup({ panel, label: "脸型" });
		await expect(page.getByTestId("portrait-section-face-shape")).toBeVisible();
		await setAdjustment({ page, label: "瘦脸", value: 1 });
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const subtleFace = await canvasHash({ page });

		await setAdjustment({ page, label: "瘦脸", value: 100 });
		await setAdjustment({ page, label: "V脸", value: 80 });
		const faceHash = await waitForCanvasChange({
			page,
			previousHash: subtleFace.hash,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "03-face-shape-live-preview.png"),
			animations: "disabled",
		});

		await openPortraitGroup({ panel, label: "五官精修" });
		await expect(page.getByTestId("portrait-section-features")).toBeVisible();
		await setAdjustment({ page, label: "大眼", value: 100 });
		await setAdjustment({ page, label: "瘦鼻", value: 80 });
		await setAdjustment({ page, label: "嘴大小", value: 40 });
		const commonFeatureHash = await waitForCanvasChange({
			page,
			previousHash: faceHash.hash,
		});

		await selectFeatureCategory({ page, name: "眉毛" });
		await setAdjustment({ page, label: "眉毛大小", value: 50 });
		const advancedFeatureHash = await waitForCanvasChange({
			page,
			previousHash: commonFeatureHash.hash,
		});

		await selectFeatureCategory({ page, name: "精修" });
		await setAdjustment({ page, label: "亮眼", value: 100 });
		const featureHash = await waitForCanvasChange({
			page,
			previousHash: advancedFeatureHash.hash,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "04-features-live-preview.png"),
			animations: "disabled",
		});

		await openPortraitGroup({ panel, label: "美妆" });
		await expect(page.getByTestId("portrait-section-makeup")).toBeVisible();
		await page.getByRole("button", { name: "口红", exact: true }).click();
		await page.getByRole("button", { name: "柔和粉", exact: true }).click();
		await page.getByRole("button", { name: "美瞳", exact: true }).click();
		await page.getByRole("button", { name: "原生", exact: true }).click();
		const makeupHash = await waitForCanvasChange({
			page,
			previousHash: featureHash.hash,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "05-makeup-target-live-preview.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "美颜预设", exact: true }).click();
		await page.getByLabel("美颜预设名称").fill("E2E 五官预设");
		await page.getByRole("button", { name: "保存美颜预设" }).click();
		await expect(
			page.getByRole("combobox", { name: "美颜预设", exact: true })
		).toContainText("E2E 五官预设");
		await panel.getByRole("tab", { name: "美颜", exact: true }).click();
		await openPortraitGroup({ panel, label: "五官精修" });
		await selectFeatureCategory({ page, name: "精修" });
		await setAdjustment({ page, label: "亮眼", value: 0 });
		await panel.getByRole("tab", { name: "美颜预设", exact: true }).click();
		await page.getByRole("button", { name: "应用美颜预设" }).click();
		await waitForCanvasHash({ page, expectedHash: makeupHash.hash });

		await panel.getByRole("tab", { name: "美体", exact: true }).click();
		await expect(page.getByTestId("portrait-section-body")).toBeVisible();
		await setAdjustment({ page, label: "天鹅颈", value: 100 });
		const swanNeckHash = await waitForCanvasChange({
			page,
			previousHash: makeupHash.hash,
		});
		await page.screenshot({
			path: path.join(outputDirectory, "06a-swan-neck-live-preview.png"),
			animations: "disabled",
		});
		await setAdjustment({ page, label: "小头", value: 70 });
		await setAdjustment({ page, label: "瘦身", value: 80 });
		await setAdjustment({ page, label: "瘦腰", value: 80 });
		await setAdjustment({ page, label: "长腿", value: 70 });
		const bodyHash = await waitForCanvasChange({
			page,
			previousHash: swanNeckHash.hash,
		});

		const state = await page.evaluate(({ trackId, elementId }) => {
			const timeline = (
				window as unknown as PortraitHarnessWindow
			).__timelineStore.getState();
			return timeline.tracks
				.find((track) => track.id === trackId)
				?.elements.find((element) => element.id === elementId)
				?.portraitAdjustments;
		}, clip);
		expect(state).toMatchObject({
			enabled: true,
			values: {
				face_adjust_Smooth: 65,
				face_adjust_skin_Intensity: 70,
				face_adjust_skin_ColdWarm: 20,
				face_adjust_TotalFace: 100,
				face_adjust_VFace: 80,
				face_adjust_EnlargeEye: 100,
				face_adjust_Nose: 80,
				face_adjust_ZoomMouth: 40,
				face_adjust_brow_size: 50,
				face_adjust_BrightEye: 100,
				body_adjust_SmallHead: 70,
				body_adjust_SlimBody: 80,
				body_adjust_SlimWaist: 80,
				body_adjust_StretchLeg: 70,
				body_adjust_SwanNeck: 100,
			},
			makeup: {
				lip: { cardId: "lip-soft-pink", intensity: 80 },
				contacts: { cardId: "contacts-natural", intensity: 80 },
			},
		});
		await page.screenshot({
			path: path.join(outputDirectory, "06-body-combined-live-preview.png"),
			animations: "disabled",
		});

		await rm(exportPath, { force: true });
		await stubExportSaveDialog({ electronApp, outputPath: exportPath });
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		const includeAudio = page.getByRole("checkbox", {
			name: "Include audio in export",
		});
		if ((await includeAudio.count()) > 0 && (await includeAudio.isChecked())) {
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
				{ timeout: 180_000, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(1_000);
		const exported = await stat(exportPath);
		await writeFile(
			path.join(outputDirectory, "e2e-evidence.json"),
			`${JSON.stringify(
				{
					exportBytes: exported.size,
					exportPath,
					skinHash,
					faceHash,
					advancedFeatureHash,
					featureHash,
					makeupHash,
					swanNeckHash,
					bodyHash,
					finalHash: bodyHash,
					sourcePath,
					state,
				},
				null,
				2
			)}\n`,
			"utf8"
		);
	});

	test("renders spot acne at maximum on a close real face", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		test.skip(
			!matureFaceSourcePath || !existsSync(matureFaceSourcePath),
			"Set QCUT_REAL_MATURE_PORTRAIT_IMAGE_PATH to a close real face"
		);
		if (!matureFaceSourcePath)
			throw new Error("Missing mature face image path");
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Jianying Spot Acne E2E");
		await uploadTestMedia(page, matureFaceSourcePath);
		const clip = await addImportedPortraitToTimeline({ page });

		const properties = page.getByTestId("media-properties");
		await properties
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		const panel = page.getByTestId("jianying-portrait-adjustments");
		await expect(panel).toBeVisible();
		await expect(
			page.getByTestId("jianying-portrait-runtime-status")
		).toContainText("就绪", { timeout: 30_000 });
		await panel.getByRole("switch", { name: "启用原版美颜美体" }).click();
		await panel.getByRole("tab", { name: "美颜", exact: true }).click();
		await openPortraitGroup({ panel, label: "皮肤管理" });
		await expect(page.getByTestId("portrait-section-skin")).toBeVisible();
		await expect
			.poll(async () => (await canvasHalfHashes({ page })).visible, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const originalHash = await canvasHalfHashes({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "02a-spot-acne-original.png"),
			animations: "disabled",
		});

		await setAdjustment({ page, label: "祛斑祛痘", value: 100 });
		const effectHash = await waitForHalfPreviewChange({
			page,
			previous: originalHash,
		});
		const state = await readPortraitAdjustments({ page, clip });
		expect(state?.values).toMatchObject({ face_adjust_SpotAcne: 100 });
		await page.screenshot({
			path: path.join(outputDirectory, "02b-spot-acne-maximum.png"),
			animations: "disabled",
		});
		await writeFile(
			path.join(outputDirectory, "spot-acne-ui-evidence.json"),
			`${JSON.stringify(
				{
					effectHash,
					matureFaceSourcePath,
					originalHash,
					state,
				},
				null,
				2
			)}\n`,
			"utf8"
		);
	});

	test("detects and edits one real face through UI, then accepts a CLI patch", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(300_000);
		test.skip(
			!multiFaceSourcePath || !existsSync(multiFaceSourcePath),
			"Set QCUT_REAL_MULTIFACE_IMAGE_PATH to a real image with two people"
		);
		if (!multiFaceSourcePath) throw new Error("Missing multi-face image path");
		await mkdir(outputDirectory, { recursive: true });
		await createTestProject(page, "Jianying Multi-Face Portrait E2E");
		await uploadTestMedia(page, multiFaceSourcePath);
		const clip = await addImportedPortraitToTimeline({ page });

		const properties = page.getByTestId("media-properties");
		await properties
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		const panel = page.getByTestId("jianying-portrait-adjustments");
		await expect(panel).toBeVisible();
		await expect(
			page.getByTestId("jianying-portrait-runtime-status")
		).toContainText("就绪", { timeout: 30_000 });
		await panel.getByRole("switch", { name: "启用原版美颜美体" }).click();
		await expect
			.poll(async () => (await canvasHalfHashes({ page })).visible, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);

		await page.getByRole("button", { name: "识别", exact: true }).click();
		const overlay = page.getByTestId("portrait-face-overlay");
		await expect(overlay).toBeVisible({ timeout: 30_000 });
		await expect(overlay.getByRole("button")).toHaveCount(2);
		const detectedFaceGeometry = await overlay
			.getByRole("button")
			.evaluateAll((buttons) => {
				const overlayBounds =
					buttons[0]?.parentElement?.getBoundingClientRect();
				if (!overlayBounds) return [];
				return buttons.map((button) => {
					const bounds = button.getBoundingClientRect();
					return {
						bindingStatus: button.dataset.bindingStatus,
						centerX:
							(bounds.left + bounds.width / 2 - overlayBounds.left) /
							overlayBounds.width,
						centerY:
							(bounds.top + bounds.height / 2 - overlayBounds.top) /
							overlayBounds.height,
						faceId: Number(button.dataset.faceId),
						freidTrackId: Number(button.dataset.freidTrackId),
						personBindingId: button.dataset.personBindingId,
					};
				});
			});
		expect(
			detectedFaceGeometry
				.map(({ centerX }) => (centerX < 0.5 ? "left" : "right"))
				.sort()
		).toEqual(["left", "right"]);
		for (const face of detectedFaceGeometry) {
			expect(face.centerY).toBeLessThan(0.65);
			expect(face.faceId).toBeGreaterThanOrEqual(0);
			expect(face.freidTrackId).toBeGreaterThanOrEqual(0);
			expect(face.personBindingId).toMatch(/^portrait-person:/);
			expect(face.bindingStatus).toBe("new");
		}
		expect(
			new Set(
				detectedFaceGeometry.map(({ personBindingId }) => personBindingId)
			).size
		).toBe(2);
		const firstFace = overlay.getByRole("button", {
			name: "人脸 1",
			exact: true,
		});
		await openPortraitGroup({ panel, label: "脸型" });
		await setAdjustment({ page, label: "瘦脸", value: 1 });
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const baselineHash = await canvasHash({ page });
		const baseline = await canvasHalfHashes({ page });
		await storeCanvasBaseline({ page });
		await page.getByTestId("color-preview-canvas").screenshot({
			path: path.join(outputDirectory, "07a-multiface-baseline-canvas.png"),
			animations: "disabled",
		});
		await firstFace.click();
		await expect(firstFace).toHaveAttribute("aria-pressed", "true");
		const selectedHalf = await firstFace.evaluate((button) => {
			const overlayElement = button.closest<HTMLElement>(
				'[data-testid="portrait-face-overlay"]'
			);
			if (!overlayElement) throw new Error("Face overlay unavailable");
			const faceBounds = button.getBoundingClientRect();
			const overlayBounds = overlayElement.getBoundingClientRect();
			return faceBounds.left + faceBounds.width / 2 <
				overlayBounds.left + overlayBounds.width / 2
				? "left"
				: "right";
		});
		await page.screenshot({
			path: path.join(outputDirectory, "07-multiface-detected-selected.png"),
			animations: "disabled",
		});

		await openPortraitGroup({ panel, label: "美妆" });
		await page.getByRole("button", { name: "口红", exact: true }).click();
		await page.getByRole("button", { name: "柔和粉", exact: true }).click();
		await waitForCanvasChange({
			page,
			previousHash: baselineHash.hash,
		});
		const targetedMakeup = await canvasHalfHashes({ page });
		await page.getByTestId("color-preview-canvas").screenshot({
			path: path.join(outputDirectory, "08a-one-face-makeup-canvas.png"),
			animations: "disabled",
		});
		const targetedMakeupDifference = await canvasDifferenceFromBaseline({
			page,
		});
		const selectedAbsoluteDifference =
			selectedHalf === "left"
				? targetedMakeupDifference.leftAbsolute
				: targetedMakeupDifference.rightAbsolute;
		const otherAbsoluteDifference =
			selectedHalf === "left"
				? targetedMakeupDifference.rightAbsolute
				: targetedMakeupDifference.leftAbsolute;
		const selectedChangedPixels =
			selectedHalf === "left"
				? targetedMakeupDifference.leftChangedPixels
				: targetedMakeupDifference.rightChangedPixels;
		const otherChangedPixels =
			selectedHalf === "left"
				? targetedMakeupDifference.rightChangedPixels
				: targetedMakeupDifference.leftChangedPixels;
		expect(selectedAbsoluteDifference).toBeGreaterThan(otherAbsoluteDifference);
		expect(selectedChangedPixels).toBeGreaterThan(otherChangedPixels);

		const makeupHash = await canvasHash({ page });
		await openPortraitGroup({ panel, label: "脸型" });
		await setAdjustment({ page, label: "瘦脸", value: 90 });
		await waitForPortraitCanvasChange({
			page,
			previousHash: makeupHash.hash,
		});
		const faceState = await readPortraitAdjustments({ page, clip });
		expect(faceState?.values).toEqual({ face_adjust_TotalFace: 1 });
		expect(faceState?.faces).toHaveLength(1);
		expect(faceState?.faces?.[0]).toMatchObject({
			personBindingId: detectedFaceGeometry[0]?.personBindingId,
			bindingAnchor: { frameNumber: 0 },
			values: { face_adjust_TotalFace: 90 },
			makeup: { lip: { cardId: "lip-soft-pink", intensity: 80 } },
		});
		await page.screenshot({
			path: path.join(outputDirectory, "08-one-face-makeup-and-shape.png"),
			animations: "disabled",
		});
		const selectedPersonBindingId = faceState?.faces?.[0]?.personBindingId;
		if (!selectedPersonBindingId) {
			throw new Error("Selected project person binding was not persisted");
		}
		await page.getByRole("button", { name: "识别", exact: true }).click();
		await expect(overlay.getByRole("button")).toHaveCount(2);
		const rematchedFace = overlay.locator(
			`[data-person-binding-id="${selectedPersonBindingId}"]`
		);
		await expect(rematchedFace).toHaveCount(1);
		await expect(rematchedFace).toHaveAttribute(
			"data-binding-status",
			"matched"
		);
		await expect(rematchedFace).toHaveAttribute("aria-pressed", "true");
		const redetectedFaceGeometry = await overlay
			.getByRole("button")
			.evaluateAll((buttons) =>
				buttons.map((button) => ({
					bindingStatus: button.dataset.bindingStatus,
					faceId: Number(button.dataset.faceId),
					freidTrackId: Number(button.dataset.freidTrackId),
					personBindingId: button.dataset.personBindingId,
				}))
			);
		await page.screenshot({
			path: path.join(outputDirectory, "08b-person-binding-rematched.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "美体", exact: true }).click();
		await expect(page.getByTestId("portrait-body-scope")).toContainText(
			"全部人物"
		);
		const beforeBodyHash = await canvasHash({ page });
		await setAdjustment({ page, label: "瘦腰", value: 70 });
		await waitForPortraitCanvasChange({
			page,
			previousHash: beforeBodyHash.hash,
		});
		await expect(portraitFallbackToast({ page })).toBeHidden();
		const bodyState = await readPortraitAdjustments({ page, clip });
		expect(bodyState?.values).toMatchObject({ body_adjust_SlimWaist: 70 });
		expect(bodyState?.faces?.[0].values).not.toHaveProperty(
			"body_adjust_SlimWaist"
		);
		await page.screenshot({
			path: path.join(outputDirectory, "09-body-all-people-scope.png"),
			animations: "disabled",
		});

		const selectedFaceState = bodyState?.faces?.[0];
		if (!selectedFaceState) {
			throw new Error("Selected project person was lost before the CLI patch");
		}
		const cliAdjustments = {
			...bodyState,
			enabled: true,
			values: {
				...bodyState?.values,
				body_adjust_StretchLeg: 55,
			},
			faces: [
				{
					...selectedFaceState,
					values: {
						...selectedFaceState.values,
						face_adjust_TotalFace: 20,
					},
				},
			],
		};
		const beforeCliHash = await canvasHash({ page });
		const editorApiPort = await electronApp.evaluate(
			() => process.env.QCUT_API_PORT ?? "8765"
		);
		const projectId = new URL(page.url()).hash.match(
			/^#\/editor\/([^/?]+)/
		)?.[1];
		if (!projectId) throw new Error("Could not resolve the E2E project id");
		const cliResult = await runQCutCLI({
			args: [
				"editor:element:patch",
				"--port",
				editorApiPort,
				"--project-id",
				decodeURIComponent(projectId),
				"--element-id",
				clip.elementId,
				"--set",
				JSON.stringify({ portraitAdjustments: cliAdjustments }),
				"--force",
				"--json",
			],
		});
		expect(JSON.parse(cliResult.stdout)).toMatchObject({ status: "ok" });
		const cliState = await readPortraitAdjustments({ page, clip });
		expect(cliState?.faces?.[0]?.personBindingId).toBe(
			faceState?.faces?.[0]?.personBindingId
		);
		expect(cliState?.values).toMatchObject({
			body_adjust_SlimWaist: 70,
			body_adjust_StretchLeg: 55,
		});
		expect(cliState?.faces?.[0]?.values).toMatchObject({
			face_adjust_TotalFace: 20,
		});
		await expect(page.getByLabel("长腿数值", { exact: true })).toHaveValue(
			"55"
		);
		await waitForPortraitCanvasChange({
			page,
			previousHash: beforeCliHash.hash,
		});
		await expect(portraitFallbackToast({ page })).toBeHidden();
		await page.screenshot({
			path: path.join(outputDirectory, "10-cli-patch-reflected-in-ui.png"),
			animations: "disabled",
		});
		await writeFile(
			path.join(outputDirectory, "multiface-ui-cli-evidence.json"),
			`${JSON.stringify(
				{
					baseline,
					cli: JSON.parse(cliResult.stdout),
					cliState,
					detectedFaceGeometry,
					faceState,
					multiFaceSourcePath,
					redetectedFaceGeometry,
					selectedHalf,
					targetedMakeup,
					targetedMakeupDifference,
				},
				null,
				2
			)}\n`,
			"utf8"
		);
	});
});
