import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { Locator, Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const execFileAsync = promisify(execFile);
const sourcePath =
	process.env.QCUT_REAL_BODY_IMAGE_PATH ??
	"/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/body-multiface-2026-08-25/body-frame.png";
const outputDirectory = path.resolve("output/playwright/jianying-manual-body");
const exportPath = path.join(outputDirectory, "manual-body-export.mp4");
const exportFramePath = path.join(
	outputDirectory,
	"manual-body-export-frame.png"
);

interface ManualBodyHarnessWindow extends Window {
	__mediaStore: {
		getState: () => { mediaItems: Array<{ id: string; name: string }> };
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
						manualBody?: Record<string, Record<string, number>>;
					};
				}>;
			}>;
			addElementToTrack: (
				trackId: string,
				element: Record<string, unknown>
			) => string | null;
			setSelectedElements: (
				selection: Array<{ trackId: string; elementId: string }>
			) => void;
		};
	};
}

async function addBodyImage({ page }: { page: Page }) {
	return page.evaluate(() => {
		const harness = window as unknown as ManualBodyHarnessWindow;
		const media = harness.__mediaStore.getState().mediaItems[0];
		const timeline = harness.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		if (!media || !track) throw new Error("Expected imported body media");
		const elementId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: media.id,
			name: media.name,
			duration: 1,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
			rotation: 14,
			scaleX: 0.86,
			scaleY: 1.08,
			crop: { top: 0.08, right: 0.12, bottom: 0.1, left: 0.16 },
		});
		if (!elementId) throw new Error("Failed to add body media");
		timeline.setSelectedElements([{ trackId: track.id, elementId }]);
		return { elementId, trackId: track.id };
	});
}

async function manualBodyState({
	clip,
	page,
}: {
	clip: { elementId: string; trackId: string };
	page: Page;
}) {
	return page.evaluate(({ elementId, trackId }) => {
		const timeline = (
			window as unknown as ManualBodyHarnessWindow
		).__timelineStore.getState();
		return timeline.tracks
			.find((track) => track.id === trackId)
			?.elements.find((element) => element.id === elementId)
			?.portraitAdjustments?.manualBody;
	}, clip);
}

async function canvasHash({ page }: { page: Page }) {
	return page.getByTestId("color-preview-canvas").evaluate((canvasNode) => {
		const canvas = canvasNode as HTMLCanvasElement;
		const pixels = canvas
			.getContext("2d", { willReadFrequently: true })
			?.getImageData(0, 0, canvas.width, canvas.height).data;
		if (!pixels) return { hash: 0, nonBlack: 0, opaque: 0 };
		let hash = 2166136261;
		let nonBlack = 0;
		let opaque = 0;
		for (let index = 0; index < pixels.length; index += 4) {
			for (let channel = 0; channel < 3; channel += 1) {
				hash ^= pixels[index + channel] ?? 0;
				hash = Math.imul(hash, 16777619);
			}
			if ((pixels[index + 3] ?? 0) > 0) {
				opaque += 1;
				if (
					(pixels[index] ?? 0) +
						(pixels[index + 1] ?? 0) +
						(pixels[index + 2] ?? 0) >
					12
				) {
					nonBlack += 1;
				}
			}
		}
		return { hash: hash >>> 0, nonBlack, opaque };
	});
}

async function setNumber({
	controls,
	label,
	value,
}: {
	controls: ReturnType<Page["getByTestId"]>;
	label: string;
	value: string;
}) {
	const input = controls.getByLabel(`${label}数值`, { exact: true });
	await input.fill(value);
	await input.press("Tab");
}

async function dragHandle({
	deltaX,
	deltaY,
	locator,
	page,
}: {
	deltaX: number;
	deltaY: number;
	locator: Locator;
	page: Page;
}) {
	const bounds = await locator.boundingBox();
	if (!bounds) throw new Error("Expected a visible manual body canvas handle");
	const x = bounds.x + bounds.width / 2;
	const y = bounds.y + bounds.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 });
	await page.mouse.up();
}

test.describe("Jianying manual body product flow", () => {
	test.setTimeout(300_000);
	test.use({ captureScreenshotVideo: false });
	test.skip(!existsSync(sourcePath), "Real body image fixture is missing");

	test("previews, edits, exports, and reopens in strict offline mode", async ({
		electronApp,
		page,
	}) => {
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await electronApp.evaluate(() => {
			process.env.QCUT_JIANYING_DISABLE_APP_BUNDLE = "1";
			process.env.QCUT_JIANYING_DISABLE_USER_CACHE = "1";
		});
		await createTestProject(page, "Jianying Manual Body E2E");
		await uploadTestMedia(page, sourcePath);
		const clip = await addBodyImage({ page });

		const properties = page.getByTestId("media-properties");
		await properties
			.getByRole("tab", { name: "美颜美体", exact: true })
			.click();
		const panel = page.getByTestId("jianying-portrait-adjustments");
		await expect(panel).toBeVisible();
		await expect(
			page.getByTestId("jianying-portrait-runtime-status")
		).toContainText("离线就绪", { timeout: 30_000 });
		await panel.getByRole("switch", { name: "启用原版美颜美体" }).click();
		await panel.getByRole("tab", { name: "美体", exact: true }).click();
		const smartBodyGroup = page.getByTestId("portrait-group-smart-body");
		const manualBodyGroup = page.getByTestId("portrait-group-manual-body");
		const smartBodyTrigger = smartBodyGroup.getByRole("button", {
			name: "智能美体",
			exact: true,
		});
		const manualBodyTrigger = manualBodyGroup.getByRole("button", {
			name: "手动美体",
			exact: true,
		});
		await expect(smartBodyTrigger).toHaveAttribute("aria-expanded", "true");
		await smartBodyTrigger.click();
		await expect(smartBodyTrigger).toHaveAttribute("aria-expanded", "false");
		await page.screenshot({
			path: path.join(outputDirectory, "00-collapsible-body-groups.png"),
			animations: "disabled",
		});
		await smartBodyTrigger.click();
		await manualBodyTrigger.click();
		await expect(manualBodyTrigger).toHaveAttribute("aria-expanded", "true");
		await expect(smartBodyTrigger).toHaveAttribute("aria-expanded", "true");
		const controls = page.getByTestId("portrait-manual-body-controls");
		await expect(controls).toBeVisible();
		const overlay = page.getByTestId("portrait-manual-body-overlay");
		await expect(overlay).toBeVisible();
		await manualBodyTrigger.click();
		await expect(overlay).toBeHidden();
		await manualBodyTrigger.click();
		await expect(overlay).toBeVisible();
		await expect
			.poll(async () => (await overlay.boundingBox())?.width ?? 0)
			.toBeGreaterThan(500);
		await expect(overlay).toHaveAttribute("data-manual-body-tool", "stretch");
		await expect
			.poll(async () => {
				const value = await page
					.getByTestId("manual-body-stretch-upper")
					.locator("line")
					.getAttribute("x2");
				return Number(value);
			})
			.toBeGreaterThan(500);
		await setNumber({ controls, label: "强度", value: "50" });
		await setNumber({ controls, label: "上边界", value: "72" });
		await setNumber({ controls, label: "下边界", value: "18" });
		const stretchBeforeDrag = await manualBodyState({ page, clip });
		await dragHandle({
			page,
			locator: page.getByTestId("manual-body-stretch-upper-handle"),
			deltaX: 0,
			deltaY: 28,
		});
		await expect
			.poll(async () => (await manualBodyState({ page, clip }))?.stretch?.upper)
			.not.toBe(stretchBeforeDrag?.stretch?.upper);
		await expect(page.getByTestId("color-preview-canvas")).toBeVisible({
			timeout: 30_000,
		});
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const stretchHash = await canvasHash({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "01-stretch-lines-transformed.png"),
			animations: "disabled",
		});

		await controls
			.getByRole("button", { name: "瘦身瘦腿", exact: true })
			.click();
		await setNumber({ controls, label: "强度", value: "50" });
		await setNumber({ controls, label: "旋转", value: "28" });
		const slimRect = page.getByTestId("manual-body-slim-rect");
		await expect(slimRect).toBeVisible();
		await expect
			.poll(async () => (await slimRect.boundingBox())?.width ?? 0)
			.toBeGreaterThan(50);
		const slimBeforeDrag = await manualBodyState({ page, clip });
		await dragHandle({
			page,
			locator: slimRect,
			deltaX: 36,
			deltaY: 16,
		});
		await expect
			.poll(async () => (await manualBodyState({ page, clip }))?.slim?.x)
			.not.toBe(slimBeforeDrag?.slim?.x);
		await expect
			.poll(async () => (await canvasHash({ page })).hash, { timeout: 30_000 })
			.not.toBe(stretchHash.hash);
		const slimState = await manualBodyState({ page, clip });
		expect(slimState?.slim).toMatchObject({ intensity: 50, rotation: 28 });
		await controls.getByRole("button", { name: "撤销手动美体" }).click();
		await expect
			.poll(async () => (await manualBodyState({ page, clip }))?.slim?.x)
			.toBe(slimBeforeDrag?.slim?.x);
		await controls.getByRole("button", { name: "重做手动美体" }).click();
		await expect
			.poll(async () => (await manualBodyState({ page, clip }))?.slim?.x)
			.toBe(slimState?.slim?.x);
		await page.screenshot({
			path: path.join(outputDirectory, "02-rotated-slim-undo-redo.png"),
			animations: "disabled",
		});

		await controls
			.getByRole("button", { name: "放大缩小", exact: true })
			.click();
		await setNumber({ controls, label: "强度", value: "50" });
		await setNumber({ controls, label: "中心 X", value: "55" });
		await setNumber({ controls, label: "中心 Y", value: "52" });
		await setNumber({ controls, label: "半径", value: "24" });
		const zoomCircle = page.getByTestId("manual-body-zoom-circle");
		await expect(zoomCircle).toBeVisible();
		await expect
			.poll(async () => (await zoomCircle.boundingBox())?.width ?? 0)
			.toBeGreaterThan(50);
		const zoomBeforeDrag = await manualBodyState({ page, clip });
		await dragHandle({
			page,
			locator: page.getByTestId("manual-body-zoom-radius"),
			deltaX: 36,
			deltaY: 0,
		});
		await expect
			.poll(async () => (await manualBodyState({ page, clip }))?.zoom?.radius)
			.not.toBe(zoomBeforeDrag?.zoom?.radius);
		const finalState = await manualBodyState({ page, clip });
		expect(finalState?.stretch).toMatchObject({
			intensity: 50,
			bottom: 0.18,
		});
		expect(finalState?.slim).toMatchObject({ intensity: 50, rotation: 28 });
		expect(finalState?.zoom).toMatchObject({
			intensity: 50,
			x: 0.55,
			y: 0.52,
		});
		await expect
			.poll(async () => (await canvasHash({ page })).nonBlack, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const finalHash = await canvasHash({ page });
		await page.screenshot({
			path: path.join(outputDirectory, "03-zoom-circle-native-preview.png"),
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
		if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable");
		await execFileAsync(ffmpegPath, [
			"-y",
			"-ss",
			"0.2",
			"-i",
			exportPath,
			"-frames:v",
			"1",
			exportFramePath,
		]);
		expect((await stat(exportFramePath)).size).toBeGreaterThan(1_000);

		await page.waitForTimeout(1_500);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForFunction(
			({ elementId, trackId }) => {
				const timeline = (
					window as unknown as ManualBodyHarnessWindow
				).__timelineStore?.getState();
				return timeline?.tracks
					.find((track) => track.id === trackId)
					?.elements.some((element) => element.id === elementId);
			},
			clip,
			{ timeout: 30_000 }
		);
		const reopenedState = await manualBodyState({ page, clip });
		expect(reopenedState).toEqual(finalState);
		await page.evaluate(({ elementId, trackId }) => {
			(window as unknown as ManualBodyHarnessWindow).__timelineStore
				.getState()
				.setSelectedElements([{ trackId, elementId }]);
		}, clip);
		await page
			.getByTestId("media-properties")
			.getByRole("tab", {
				name: "美颜美体",
				exact: true,
			})
			.click();
		await page
			.getByTestId("jianying-portrait-adjustments")
			.getByRole("tab", { name: "美体", exact: true })
			.click();
		await page
			.getByTestId("jianying-portrait-adjustments")
			.getByRole("button", { name: "手动美体", exact: true })
			.click();
		await expect(
			page.getByTestId("portrait-manual-body-overlay")
		).toBeVisible();
		await page.screenshot({
			path: path.join(outputDirectory, "04-project-reopened.png"),
			animations: "disabled",
		});

		await writeFile(
			path.join(outputDirectory, "e2e-evidence.json"),
			`${JSON.stringify(
				{
					exportBytes: (await stat(exportPath)).size,
					exportFramePath,
					exportPath,
					finalHash,
					finalState,
					reopenedState,
					sourcePath,
					stretchHash,
					strictOffline: true,
				},
				null,
				2
			)}\n`
		);
	});
});
