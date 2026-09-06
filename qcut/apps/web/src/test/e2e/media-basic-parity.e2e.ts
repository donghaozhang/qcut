/**
 * 画面 → 基础 parity gate.
 *
 * The basic sub-tab mirrors the reference layout: an alignment toolbar on
 * top, then 混合 / 变形 / 视频防抖 / 一键画质提升 / 超清画质 / 画面降噪 sections
 * whose headers carry an enable checkbox. Every checkbox binds to real element
 * state, and 拖拽变形 hands the corner pin to draggable preview handles, so this
 * spec drives the real UI and reads the timeline store after each step.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import {
	createTestProject,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-basic-parity-fixtures");
const EVIDENCE_DIR = path.resolve("output/playwright/media-basic-parity");

function generateClip(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "parity-base.mp4");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=1280x720:rate=30:duration=2",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

function generateImage(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "parity-image.png");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=640x360:rate=1:duration=1",
			"-frames:v",
			"1",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

async function readElement(page: Page) {
	return page.evaluate(() => {
		const store = (window as any).__timelineStore.getState();
		const track = store.tracks.find(
			(item: any) => item.isMain || item.type === "media"
		);
		const element = track.elements[0];
		return {
			enhancements: element.enhancements ?? null,
			perspective: element.perspective ?? null,
			perspectiveEnabled: element.perspectiveEnabled,
			blendEnabled: element.blendEnabled,
			id: element.id as string,
		};
	});
}

test.use({ captureScreenshotVideo: false });
test.setTimeout(600_000);

test.describe("media basic parity", () => {
	test("sections, toggles and drag warp bind to real element state", async ({
		page,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		await createTestProject(page, "Basic Parity");
		await uploadTestMedia(page, generateClip());

		const elementId = await page.evaluate(() => {
			const harness = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
			};
			const item = harness.__mediaStore
				.getState()
				.mediaItems.find(
					(candidate: { type: string }) => candidate.type === "video"
				);
			if (!item) throw new Error("No video imported");
			const state = harness.__timelineStore.getState();
			const trackId =
				state.tracks.find(
					(track: { isMain?: boolean; type: string }) =>
						track.isMain || track.type === "media"
				)?.id ?? state.addTrack("media");
			harness.__timelineStore.getState().addElementToTrack(
				trackId,
				{
					duration: 2,
					mediaId: item.id,
					name: "parity-clip",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				},
				{ pushHistory: false, selectElement: false }
			);
			const track = harness.__timelineStore
				.getState()
				.tracks.find((candidate: { id: string }) => candidate.id === trackId);
			const element = track.elements[0];
			harness.__timelineStore
				.getState()
				.selectElement(trackId, element.id, false);
			return element.id as string;
		});

		const properties = page.getByTestId("media-properties");
		await expect(properties).toBeVisible();

		// --- layout: toolbar first, then the reference section order -----------
		const basic = properties.locator('[role="tabpanel"][data-state="active"]');
		await expect(basic.getByTestId("media-alignment-toolbar")).toBeVisible();
		const headers = basic.locator("button[aria-expanded]");
		const titles = (await headers.allInnerTexts()).map((text) => text.trim());
		console.log(`[basic-parity] SECTIONS=${JSON.stringify(titles)}`);
		const order = [
			"位置与大小",
			"混合",
			"裁剪与适应",
			"变形",
			"视频防抖",
			"一键画质提升",
			"超清画质",
			"画面降噪",
		];
		let cursor = -1;
		for (const title of order) {
			const index = titles.findIndex(
				(text, position) => position > cursor && text.startsWith(title)
			);
			expect(index, `section ${title} after ${cursor}`).toBeGreaterThan(cursor);
			cursor = index;
		}
		await expect(basic.getByTestId("media-blend-keyframes")).toBeVisible();

		// --- 视频防抖: checkbox + level dropdown ----------------------------------
		await basic.getByLabel("启用视频防抖").click();
		await expect
			.poll(async () => (await readElement(page)).enhancements?.stabilization)
			.toBe(50);
		await basic.getByRole("button", { name: "视频防抖", exact: true }).click();
		await basic.getByTestId("media-stabilization-level").click();
		await page.getByRole("option", { name: "最强", exact: true }).click();
		await expect
			.poll(async () => (await readElement(page)).enhancements?.stabilization)
			.toBe(100);

		// --- 一键画质提升 / 超清画质 / 画面降噪 -----------------------------------
		await basic.getByLabel("启用一键画质提升").click();
		await expect
			.poll(async () => (await readElement(page)).enhancements?.clarity)
			.toBe(40);
		await basic.getByLabel("启用超清画质").click();
		await expect
			.poll(async () => (await readElement(page)).enhancements?.upscale)
			.toBe(2);
		await basic.getByLabel("启用画面降噪").click();
		await expect
			.poll(async () => (await readElement(page)).enhancements?.denoise)
			.toBe(30);

		// --- 变形: drag a preview corner, then switch the section off ------------
		await basic.getByRole("button", { name: "变形", exact: true }).click();
		await basic.getByTestId("media-warp-drag-toggle").click();
		const handle = page.getByTestId("media-perspective-handle-topLeft");
		await expect(handle).toBeVisible();
		const box = await handle.boundingBox();
		if (!box) throw new Error("No handle box");
		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + 40, startY + 30, { steps: 8 });
		await page.mouse.up();
		await expect
			.poll(async () => (await readElement(page)).perspective?.topLeftX ?? 0)
			.toBeGreaterThan(0.02);
		const warped = await readElement(page);
		// The pin follows the corner it just moved.
		const movedBox = await handle.boundingBox();
		if (!movedBox) throw new Error("No handle box after drag");
		expect(movedBox.x).toBeGreaterThan(box.x + 20);
		expect(movedBox.y).toBeGreaterThan(box.y + 15);
		expect(warped.perspective?.topLeftY ?? 0).toBeGreaterThan(0.02);
		expect(warped.id).toBe(elementId);

		const previewTransform = () =>
			page.evaluate((id) => {
				const root = document.querySelector(
					`[data-preview-element-id="${id}"]`
				);
				const warpedNode = root
					? Array.from(root.querySelectorAll<HTMLElement>("*")).find((node) =>
							node.style.transform.includes("matrix3d")
						)
					: undefined;
				return warpedNode?.style.transform ?? "";
			}, elementId);
		await expect.poll(previewTransform).toContain("matrix3d");

		await basic.getByLabel("启用变形").click();
		await expect
			.poll(async () => (await readElement(page)).perspectiveEnabled)
			.toBe(false);
		// Values survive the toggle; only the rendered warp goes away, and the
		// panel keeps showing the stored offsets so nothing looks lost.
		expect((await readElement(page)).perspective?.topLeftX).toBeCloseTo(
			warped.perspective!.topLeftX,
			5
		);
		await expect.poll(previewTransform).not.toContain("matrix3d");
		expect(
			Number(await basic.getByLabel("左上角 X数值").inputValue())
		).toBeGreaterThan(0);

		// --- image branch renders the same corner-pin -----------------------------
		await page.evaluate(
			({ id }) => {
				const store = (window as any).__timelineStore.getState();
				const track = store.tracks.find(
					(item: any) => item.isMain || item.type === "media"
				);
				store.updateMediaElement(track.id, id, {
					perspectiveEnabled: true,
				});
			},
			{ id: elementId }
		);
		await expect.poll(previewTransform).toContain("matrix3d");
		const imagePath = generateImage();
		await uploadTestMedia(page, imagePath);
		const imageElementId = await page.evaluate(() => {
			const harness = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
			};
			const item = harness.__mediaStore
				.getState()
				.mediaItems.find(
					(candidate: { type: string }) => candidate.type === "image"
				);
			if (!item) throw new Error("No image imported");
			const state = harness.__timelineStore.getState();
			const trackId = state.addTrack("media");
			harness.__timelineStore.getState().addElementToTrack(
				trackId,
				{
					duration: 2,
					mediaId: item.id,
					name: "parity-image",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
					perspective: {
						topLeftX: 0.15,
						topLeftY: 0.1,
						topRightX: 1,
						topRightY: 0,
						bottomRightX: 1,
						bottomRightY: 1,
						bottomLeftX: 0,
						bottomLeftY: 1,
					},
				},
				{ pushHistory: false, selectElement: false }
			);
			const track = harness.__timelineStore
				.getState()
				.tracks.find((candidate: { id: string }) => candidate.id === trackId);
			return track.elements[0].id as string;
		});
		await expect
			.poll(() =>
				page.evaluate((id) => {
					const root = document.querySelector(
						`[data-preview-element-id="${id}"]`
					);
					const node = root
						? Array.from(root.querySelectorAll<HTMLElement>("*")).find(
								(candidate) => candidate.style.transform.includes("matrix3d")
							)
						: undefined;
					return node ? node.style.transformOrigin : "";
				}, imageElementId)
			)
			.toBe("0px 0px");

		const shot = await properties.screenshot({ animations: "disabled" });
		await writeFile(path.join(EVIDENCE_DIR, "basic-panel.png"), shot);
		await basic.getByTestId("media-alignment-toolbar").scrollIntoViewIfNeeded();
		await writeFile(
			path.join(EVIDENCE_DIR, "editor.png"),
			await page.screenshot({ animations: "disabled" })
		);
	});
});
