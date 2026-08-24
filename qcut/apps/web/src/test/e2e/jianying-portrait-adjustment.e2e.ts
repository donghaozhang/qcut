import { existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const sourcePath = process.env.QCUT_REAL_PORTRAIT_IMAGE_PATH;
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
							values: Record<string, number>;
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
		await panel.getByRole("tab", { name: "皮肤", exact: true }).click();
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

		await panel.getByRole("tab", { name: "脸型", exact: true }).click();
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

		await panel.getByRole("tab", { name: "五官", exact: true }).click();
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

		await panel.getByRole("tab", { name: "美妆", exact: true }).click();
		await expect(page.getByTestId("portrait-section-makeup")).toBeVisible();
		await page.getByRole("button", { name: "口红", exact: true }).click();
		await page.getByRole("button", { name: "柔和粉", exact: true }).click();
		await page.getByRole("button", { name: "美瞳", exact: true }).click();
		await page.getByRole("button", { name: "原生", exact: true }).click();
		await page.getByLabel("人脸选择").click();
		await page.getByRole("option", { name: "人脸 1", exact: true }).click();
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
		await panel.getByRole("tab", { name: "五官", exact: true }).click();
		await selectFeatureCategory({ page, name: "精修" });
		await setAdjustment({ page, label: "亮眼", value: 0 });
		await panel.getByRole("tab", { name: "美颜预设", exact: true }).click();
		await page.getByRole("button", { name: "应用美颜预设" }).click();
		await waitForCanvasHash({ page, expectedHash: makeupHash.hash });

		await panel.getByRole("tab", { name: "美体", exact: true }).click();
		await expect(page.getByTestId("portrait-section-body")).toBeVisible();
		await setAdjustment({ page, label: "小头", value: 70 });
		await setAdjustment({ page, label: "瘦身", value: 80 });
		await setAdjustment({ page, label: "瘦腰", value: 80 });
		await setAdjustment({ page, label: "长腿", value: 70 });
		const bodyHash = await waitForCanvasChange({
			page,
			previousHash: makeupHash.hash,
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
			},
			faceTarget: { mode: "single", faceId: 0 },
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
	test("persists and renders per-face adjustment sets written via the store", async ({
		page,
	}) => {
		test.setTimeout(240_000);
		if (!sourcePath) throw new Error("Missing real portrait image path");
		await createTestProject(page, "Jianying Per-Face Portrait E2E");
		await uploadTestMedia(page, sourcePath);
		const clip = await addImportedPortraitToTimeline({ page });

		const previewCanvas = page.getByTestId("color-preview-canvas");
		await expect(previewCanvas).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(async () => (await canvasHash({ page })).opaque, {
				timeout: 30_000,
			})
			.toBeGreaterThan(10_000);
		const baseline = await canvasHash({ page });

		// Phase-1 writer: no per-face UI exists yet, so the harness writes faces
		// through the same store action the panel uses. TrackIds stay in the
		// render-path-verified 0..9 range until the freid id-space probe
		// resolves. The trackId-5 body entry records goal 4 (multi-person body
		// adjust): on this single-person asset it must stay inert.
		await page.evaluate(({ trackId, elementId }) => {
			const harness = window as unknown as PortraitHarnessWindow;
			harness.__timelineStore.getState().updateMediaElement(
				trackId,
				elementId,
				{
					portraitAdjustments: {
						enabled: true,
						values: {},
						faces: [
							{ trackId: 0, values: { face_adjust_TotalFace: 100 } },
							{ trackId: 5, values: { body_adjust_SlimWaist: 40 } },
						],
					},
				},
				false
			);
		}, clip);

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
			faces: [
				{ trackId: 0, values: { face_adjust_TotalFace: 100 } },
				{ trackId: 5, values: { body_adjust_SlimWaist: 40 } },
			],
		});
		expect(
			state && "faceTarget" in state ? state.faceTarget : undefined
		).toBeUndefined();

		// A per-face-only element (base values empty) must still activate the
		// native preview path: trackid 0 exists on the fixture, so pixels change.
		await waitForCanvasChange({ page, previousHash: baseline.hash });
	});
});
