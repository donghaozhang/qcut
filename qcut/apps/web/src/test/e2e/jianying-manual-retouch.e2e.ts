import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const sourcePath = process.env.QCUT_REAL_PORTRAIT_IMAGE_PATH;
const outputDirectory = path.resolve(
	"output/playwright/jianying-manual-retouch"
);

interface ManualRetouchHarnessWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{ id: string; name: string }>;
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
						manualRetouch?: {
							strokes: Array<{
								tool: string;
								mode: string;
								size: number;
								intensity: number;
								points: Array<{ x: number; y: number }>;
							}>;
						};
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

async function addPortraitToTimeline({ page }: { page: Page }) {
	return page.evaluate(() => {
		const harness = window as unknown as ManualRetouchHarnessWindow;
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
			for (let channel = 0; channel < 3; channel += 1) {
				hash ^= pixels[index + channel];
				hash = Math.imul(hash, 16777619);
			}
			if (pixels[index + 3] > 0) opaque += 1;
		}
		return { hash: hash >>> 0, opaque };
	});
}

async function waitForCanvasChange({
	page,
	previousHash,
}: {
	page: Page;
	previousHash: number;
}) {
	await expect
		.poll(
			async () => {
				const current = await canvasHash({ page });
				return current.opaque > 10_000 && current.hash !== previousHash;
			},
			{ timeout: 30_000 }
		)
		.toBe(true);
}

async function drawStroke({
	page,
	yOffset = 0,
}: {
	page: Page;
	yOffset?: number;
}) {
	const overlay = page.getByTestId("portrait-manual-retouch-overlay");
	const bounds = await overlay.boundingBox();
	if (!bounds) throw new Error("Manual retouch overlay has no bounds");
	const points = [
		{ x: 0.445, y: 0.39 + yOffset },
		{ x: 0.465, y: 0.405 + yOffset },
		{ x: 0.49, y: 0.42 + yOffset },
		{ x: 0.515, y: 0.435 + yOffset },
		{ x: 0.535, y: 0.45 + yOffset },
	];
	const [first, ...rest] = points;
	if (!first) throw new Error("Manual retouch path is empty");
	await page.mouse.move(
		bounds.x + first.x * bounds.width,
		bounds.y + first.y * bounds.height
	);
	await page.mouse.down();
	const moveToPoint = async ({ index }: { index: number }): Promise<void> => {
		const point = rest[index];
		if (!point) return;
		await page.mouse.move(
			bounds.x + point.x * bounds.width,
			bounds.y + point.y * bounds.height,
			{ steps: 3 }
		);
		return moveToPoint({ index: index + 1 });
	};
	await moveToPoint({ index: 0 });
	await page.mouse.up();
}

async function readManualStrokes({
	page,
	clip,
}: {
	page: Page;
	clip: { elementId: string; trackId: string };
}) {
	return page.evaluate(({ trackId, elementId }) => {
		const timeline = (
			window as unknown as ManualRetouchHarnessWindow
		).__timelineStore.getState();
		return (
			timeline.tracks
				.find((track) => track.id === trackId)
				?.elements.find((element) => element.id === elementId)
				?.portraitAdjustments?.manualRetouch?.strokes ?? []
		);
	}, clip);
}

async function hasNativeMaskCache({ root }: { root: string }) {
	const entries = await readdir(root, { withFileTypes: true });
	const directories = entries.filter((entry) => entry.isDirectory());
	const files = await Promise.all(
		directories.map(async (directory) =>
			readdir(path.join(root, directory.name)).catch(() => [])
		)
	);
	return files.some(
		(names) =>
			names.includes("retouch_config.json") &&
			names.some((name) => name.endsWith(".png"))
	);
}

test.describe("Jianying manual retouch UI", () => {
	test.skip(
		!sourcePath || !existsSync(sourcePath),
		"Set QCUT_REAL_PORTRAIT_IMAGE_PATH to a real-person image"
	);

	test("paints, erases, persists, and restores native mask strokes", async ({
		page,
	}) => {
		if (!sourcePath) throw new Error("Missing real portrait image path");
		const cacheRoot = process.env.QCUT_JIANYING_MANUAL_RETOUCH_CACHE_ROOT;
		if (!cacheRoot) throw new Error("Missing manual retouch cache root");
		await Promise.all([
			rm(outputDirectory, { recursive: true, force: true }),
			rm(cacheRoot, { recursive: true, force: true }),
		]);
		await Promise.all([
			mkdir(outputDirectory, { recursive: true }),
			mkdir(cacheRoot, { recursive: true }),
		]);

		await createTestProject(page, "Jianying Manual Retouch E2E");
		await uploadTestMedia(page, sourcePath);
		const clip = await addPortraitToTimeline({ page });

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
		await panel.getByRole("tab", { name: "美颜", exact: true }).click();
		await panel.getByRole("button", { name: "手动精修", exact: true }).click();
		const controls = page.getByTestId("portrait-manual-retouch-controls");
		await expect(controls).toBeVisible();
		await expect(
			page.getByTestId("portrait-manual-retouch-overlay")
		).toBeVisible({ timeout: 30_000 });
		await controls.getByLabel("大小数值", { exact: true }).fill("90");
		await controls.getByLabel("大小数值", { exact: true }).press("Tab");
		const intensityInput = controls.getByLabel("强度数值", { exact: true });
		await intensityInput.fill("0");
		await intensityInput.press("Tab");
		await expect(intensityInput).toHaveValue("0");
		await intensityInput.fill("100");
		await intensityInput.press("Tab");

		await page.screenshot({
			path: path.join(outputDirectory, "01-manual-controls-ready.png"),
			animations: "disabled",
		});

		await drawStroke({ page });
		await expect(page.getByTestId("portrait-manual-stroke-count")).toHaveText(
			"1 笔"
		);
		const preview = page.getByTestId("color-preview-canvas");
		await expect(preview).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const painted = await canvasHash({ page });
		const paintStrokes = await readManualStrokes({ page, clip });
		expect(paintStrokes).toHaveLength(1);
		expect(paintStrokes[0]).toMatchObject({
			tool: "smooth",
			mode: "paint",
			size: 90,
			intensity: 100,
		});
		expect(paintStrokes[0]?.points.length).toBeGreaterThanOrEqual(5);
		await expect
			.poll(() => hasNativeMaskCache({ root: cacheRoot }), { timeout: 30_000 })
			.toBe(true);
		await page.screenshot({
			path: path.join(outputDirectory, "02-native-paint-preview.png"),
			animations: "disabled",
		});

		await controls.getByRole("button", { name: "擦除", exact: true }).click();
		await drawStroke({ page });
		await expect(page.getByTestId("portrait-manual-stroke-count")).toHaveText(
			"2 笔"
		);
		await waitForCanvasChange({ page, previousHash: painted.hash });
		const eraseStrokes = await readManualStrokes({ page, clip });
		expect(eraseStrokes[1]).toMatchObject({ mode: "erase" });
		await page.screenshot({
			path: path.join(outputDirectory, "03-native-erase-preview.png"),
			animations: "disabled",
		});

		await controls.getByRole("button", { name: "撤销", exact: true }).click();
		await expect(page.getByTestId("portrait-manual-stroke-count")).toHaveText(
			"1 笔"
		);
		await controls.getByRole("button", { name: "重做", exact: true }).click();
		await expect(page.getByTestId("portrait-manual-stroke-count")).toHaveText(
			"2 笔"
		);
		await page.screenshot({
			path: path.join(outputDirectory, "04-undo-redo-restored.png"),
			animations: "disabled",
		});
	});
});
