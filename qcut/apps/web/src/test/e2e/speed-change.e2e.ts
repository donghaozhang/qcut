import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const execFileAsync = promisify(execFile);
const artifactDirectory = path.resolve("output/playwright/speed-change");
const sourcePath = path.join(artifactDirectory, "speed-source-1080p.mp4");
const exportPath = path.join(artifactDirectory, "speed-export-1080p.mp4");

interface SpeedElementState {
	id: string;
	type: string;
	mediaId: string;
	name: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	playbackRate?: number;
	speedKeyframes?: Array<{ id: string; frame: number; value: number }>;
	effectIds?: string[];
	effects?: Array<{ presetId?: string; enabled: boolean }>;
	frameInterpolation?: string;
}

interface SpeedTrackState {
	id: string;
	type: string;
	elements: SpeedElementState[];
}

interface SpeedTimelineState {
	tracks: SpeedTrackState[];
	addElementToTrack: (
		trackId: string,
		element: Omit<SpeedElementState, "id">
	) => string | null;
	selectElement: (trackId: string, elementId: string) => void;
	updateElementStartTime: (
		trackId: string,
		elementId: string,
		startTime: number
	) => void;
}

interface SpeedHarnessWindow extends Window {
	__timelineStore: { getState: () => SpeedTimelineState };
}

async function createSourceVideo({ outputPath }: { outputPath: string }) {
	if (!ffmpegStaticPath) throw new Error("ffmpeg-static is unavailable");
	await execFileAsync(ffmpegStaticPath, [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=1920x1080:rate=30",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:sample_rate=48000",
		"-t",
		"2",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-shortest",
		outputPath,
	]);
}

async function addClips({ page }: { page: Page }) {
	const mediaItem = page.getByTestId("media-item").first();
	const timelineTrack = page.getByTestId("timeline-track").first();
	await mediaItem.dragTo(timelineTrack);
	await expect(page.getByTestId("timeline-element").first()).toBeVisible();
	await page.evaluate(() => {
		const timeline = (window as SpeedHarnessWindow).__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.type === "media"
		);
		const first = track?.elements[0];
		if (!track || !first) throw new Error("Expected the imported video clip");
		timeline.updateElementStartTime(track.id, first.id, 0);
		const nextId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: first.mediaId,
			name: "Following clip",
			startTime: first.duration,
			duration: first.duration,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!nextId) throw new Error("Unable to add the following clip");
		timeline.selectElement(track.id, first.id);
	});
	await page.getByTestId("timeline-element").first().click();
}

async function speedState({ page }: { page: Page }) {
	return await page.evaluate(() => {
		const timeline = (window as SpeedHarnessWindow).__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.type === "media"
		);
		const first = track?.elements[0];
		const following = track?.elements.find(
			(element) => element.name === "Following clip"
		);
		if (!first || !following) throw new Error("Expected both timeline clips");
		return {
			startTime: first.startTime,
			sourceDuration: first.duration - first.trimStart - first.trimEnd,
			playbackRate: first.playbackRate ?? 1,
			speedKeyframes: first.speedKeyframes ?? [],
			effectIds: first.effectIds ?? [],
			effects: first.effects ?? [],
			frameInterpolation: first.frameInterpolation ?? "none",
			followingStartTime: following.startTime,
		};
	});
}

test.beforeAll(async () => {
	await rm(artifactDirectory, { recursive: true, force: true });
	await mkdir(artifactDirectory, { recursive: true });
	await createSourceVideo({ outputPath: sourcePath });
});

test.describe("Speed change workflow", () => {
	test.setTimeout(300_000);
	test.use({ captureScreenshotVideo: false });

	test("edits speed, curves, speed points, shortcuts, and exports 1080p", async ({
		electronApp,
		page,
	}) => {
		await electronApp.evaluate(async ({ session }) => {
			await session.defaultSession.clearCache();
		});
		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(
			page
				.locator(
					'[data-testid="new-project-button"]:visible, [data-testid="new-project-button-mobile"]:visible, [data-testid="new-project-button-empty-state"]:visible'
				)
				.first()
		).toBeVisible();
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await createTestProject(page, "Speed Change E2E");
		await uploadTestMedia(page, sourcePath);
		await addClips({ page });

		const properties = page.getByTestId("media-properties");
		await properties.getByRole("tab", { name: "变速", exact: true }).click();
		const speedPanel = page.getByTestId("media-speed-properties");
		await expect(speedPanel).toBeVisible();
		await expect(speedPanel.getByTestId("speed-mode-normal")).toBeVisible();
		const initialState = await speedState({ page });
		await speedPanel.getByLabel("倍速数值").fill("2");
		await speedPanel.getByLabel("倍速数值").press("Tab");
		const expectedFollowingStart =
			initialState.followingStartTime - initialState.sourceDuration / 2;
		await expect
			.poll(async () => (await speedState({ page })).followingStartTime)
			.toBeCloseTo(expectedFollowingStart, 3);
		await expect(
			page.getByTestId("timeline-speed-status").first()
		).toContainText("2x");
		await page.screenshot({
			path: path.join(artifactDirectory, "01-normal-speed.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await speedPanel.getByTestId("speed-mode-curve").click();
		for (const preset of [
			"montage",
			"hero",
			"bullet",
			"jump",
			"flash-in",
			"flash-out",
		]) {
			await expect(
				speedPanel.getByTestId(`speed-curve-preset-${preset}`)
			).toBeVisible();
		}
		await speedPanel.getByTestId("speed-curve-preset-montage").click();
		await expect
			.poll(async () => (await speedState({ page })).speedKeyframes.length)
			.toBe(9);
		await expect(
			page.getByTestId("timeline-speed-status").first()
		).toContainText("曲线");
		await page.screenshot({
			path: path.join(artifactDirectory, "02a-montage-curve.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await speedPanel.getByTestId("speed-curve-preset-hero").click();
		await expect
			.poll(async () => (await speedState({ page })).speedKeyframes.length)
			.toBe(8);
		await page.screenshot({
			path: path.join(artifactDirectory, "02b-hero-curve.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await speedPanel.getByTestId("speed-curve-preset-bullet").click();
		await expect
			.poll(async () => (await speedState({ page })).speedKeyframes.length)
			.toBe(6);
		await page.screenshot({
			path: path.join(artifactDirectory, "02c-bullet-curve.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await speedPanel.getByTestId("speed-curve-preset-montage").click();
		await expect
			.poll(async () => (await speedState({ page })).speedKeyframes.length)
			.toBe(9);
		const curvePoint = speedPanel
			.getByTestId("speed-curve-editor")
			.getByRole("button")
			.nth(1);
		const curvePointBefore = (await speedState({ page })).speedKeyframes[1];
		const curvePointBox = await curvePoint.boundingBox();
		if (!curvePointBox) throw new Error("Speed curve point is not visible");
		await page.mouse.move(
			curvePointBox.x + curvePointBox.width / 2,
			curvePointBox.y + curvePointBox.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			curvePointBox.x + curvePointBox.width / 2 + 24,
			curvePointBox.y + curvePointBox.height / 2 - 18,
			{ steps: 6 }
		);
		await page.mouse.up();
		await expect
			.poll(async () => (await speedState({ page })).speedKeyframes[1].frame)
			.not.toBe(curvePointBefore.frame);
		await page.screenshot({
			path: path.join(artifactDirectory, "02-speed-curve.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await speedPanel.getByTestId("speed-mode-beat").click();
		for (const preset of [
			"flash",
			"flash-black-focus",
			"retro-camera",
			"rainbow",
			"impact",
		]) {
			await expect(
				speedPanel.getByTestId(`speed-point-preset-${preset}`)
			).toBeVisible();
		}
		await speedPanel.getByTestId("speed-point-preset-rainbow").click();
		await speedPanel.getByTestId("speed-frame-interpolation").click();
		await expect
			.poll(async () =>
				(await speedState({ page })).effects.some(
					(effect) =>
						effect.presetId === "atmosphere-rainbow-rays" && effect.enabled
				)
			)
			.toBe(true);
		await expect
			.poll(async () => (await speedState({ page })).frameInterpolation)
			.toBe("motion-compensated");
		await page.screenshot({
			path: path.join(artifactDirectory, "03-speed-points.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});

		await page.getByTestId("project-menu-button").click();
		await page.getByRole("menuitem", { name: "快捷键" }).click();
		const shortcutDialog = page.getByTestId("keyboard-shortcuts-dialog");
		await expect(shortcutDialog).toBeVisible();
		await shortcutDialog.getByTestId("shortcut-profile-select").click();
		await page.getByRole("option", { name: "Final Cut Pro" }).click();
		for (const category of ["时间线", "播放器", "基础", "其他"]) {
			await expect(
				shortcutDialog.getByRole("tab", { name: category, exact: true })
			).toBeVisible();
		}
		await shortcutDialog
			.getByRole("textbox", { name: "搜索命令" })
			.fill("裁剪");
		await page.screenshot({
			path: path.join(artifactDirectory, "04-shortcuts.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});
		await shortcutDialog.getByRole("button", { name: "取消" }).click();

		await stubExportSaveDialog({ electronApp, outputPath: exportPath });
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await expect(page.getByTestId("export-quality-select")).toContainText(
			/1920.?1080/
		);
		await page.getByTestId("export-start-button").click();
		await expect(page.getByTestId("export-progress-bar")).toBeVisible({
			timeout: 30_000,
		});
		await page.screenshot({
			path: path.join(artifactDirectory, "05-export-progress.jpg"),
			animations: "disabled",
			type: "jpeg",
			quality: 90,
		});
		await expect
			.poll(
				async () => {
					try {
						return (await stat(exportPath)).size;
					} catch {
						return 0;
					}
				},
				{ timeout: 240_000, intervals: [1_000, 2_000, 5_000] }
			)
			.toBeGreaterThan(10_000);
	});
});
