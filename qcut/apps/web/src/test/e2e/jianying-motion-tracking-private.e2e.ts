import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const sourcePath = process.env.QCUT_JIANYING_MOTION_TRACKING_E2E_SOURCE ?? "";
const runtimeManifest = path.join(
	homedir(),
	"Library",
	"Application Support",
	"QCut",
	"PrivateRuntimes",
	"JianyingTracking",
	"current",
	"manifest.json"
);
const evidenceDirectory =
	process.env.QCUT_JIANYING_MOTION_TRACKING_E2E_EVIDENCE ??
	path.join(
		homedir(),
		"Library",
		"Application Support",
		"QCut",
		"ResearchEvidence",
		"JianyingTracking",
		"ui-e2e",
		new Date().toISOString().replace(/[:.]/gu, "-")
	);
const enabled = existsSync(sourcePath) && existsSync(runtimeManifest);

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

async function seedTrackingMask({ page }: { page: Page }) {
	await page.evaluate(() => {
		type TimelineElement = { id: string; startTime: number; type: string };
		type TimelineTrack = {
			id: string;
			type: string;
			elements: TimelineElement[];
		};
		type TimelineState = {
			tracks: TimelineTrack[];
			updateMediaElement: (
				trackId: string,
				elementId: string,
				updates: object,
				history?: boolean
			) => void;
		};
		type PlaybackState = { seek: (time: number) => void };
		const stores = window as unknown as {
			__playbackStore: { getState: () => PlaybackState };
			__timelineStore: { getState: () => TimelineState };
		};
		const timeline = stores.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.type === "media"
		);
		const element = track?.elements.find(
			(candidate) => candidate.type === "media"
		);
		if (!track || !element) throw new Error("Test video clip is unavailable");
		timeline.updateMediaElement(
			track.id,
			element.id,
			{
				trimStart: 0.2,
				masks: [
					{
						id: "bingo-e2e-mask",
						name: "校准目标",
						enabled: true,
						blendMode: "add",
						type: "object",
						centerX: 0.375,
						centerY: 0.4583333333333333,
						width: 0.25,
						height: 0.25,
						rotation: 0,
						feather: 0,
						invert: false,
					},
				],
			},
			false
		);
		stores.__playbackStore.getState().seek(element.startTime + 0.8);
	});
}

test.describe("Jianying motion tracking private desktop runtime", () => {
	test.skip(
		!enabled,
		"Requires a private tracking snapshot and QCUT_JIANYING_MOTION_TRACKING_E2E_SOURCE"
	);

	test("tracks through the QCut UI and persists mask keyframes", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		await mkdir(evidenceDirectory, { recursive: true });
		await createTestProject(page, "Motion Tracking Private E2E");
		await uploadTestMedia(page, sourcePath);
		await addVideo({ page });
		await seedTrackingMask({ page });

		const properties = page.getByTestId("media-properties");
		await properties.getByRole("tab", { name: "跟踪", exact: true }).click();
		const panel = page.getByTestId("motion-tracking-panel");
		await expect(panel).toContainText("Bingo 11.3");
		await expect(panel).toContainText("私有 oracle 已就绪", {
			timeout: 120_000,
		});
		await panel.screenshot({
			path: path.join(evidenceDirectory, "01-motion-tracking-ready.png"),
			animations: "disabled",
		});

		const trackButton = properties.getByRole("button", {
			name: "双向跟踪",
			exact: true,
		});
		await expect(trackButton).toBeEnabled();
		await trackButton.click();
		await expect(properties.getByText("跟踪完成", { exact: true })).toBeVisible(
			{
				timeout: 120_000,
			}
		);

		const state = await page.evaluate(() => {
			type Mask = {
				tracking?: {
					status?: string;
					source?: string;
					trackedFrames?: number;
					totalFrames?: number;
				};
				keyframes?: Record<string, unknown[]>;
			};
			type Element = { type: string; masks?: Mask[] };
			type Track = { elements: Element[] };
			const timeline = (
				window as unknown as {
					__timelineStore: { getState: () => { tracks: Track[] } };
				}
			).__timelineStore.getState();
			const mask = timeline.tracks
				.flatMap((track) => track.elements)
				.find((element) => element.type === "media")?.masks?.[0];
			return {
				tracking: mask?.tracking,
				centerXKeyframes: mask?.keyframes?.centerX?.length ?? 0,
				centerYKeyframes: mask?.keyframes?.centerY?.length ?? 0,
				widthKeyframes: mask?.keyframes?.width?.length ?? 0,
				heightKeyframes: mask?.keyframes?.height?.length ?? 0,
				rotationKeyframes: mask?.keyframes?.rotation?.length ?? 0,
			};
		});
		expect(state.tracking).toMatchObject({
			status: "ready",
			source: "jianying-bingo",
			anchorFrame: 24,
			trackedFrames: 54,
			totalFrames: 54,
		});
		expect(state.centerXKeyframes).toBeGreaterThanOrEqual(2);
		expect(state.centerYKeyframes).toBeGreaterThanOrEqual(2);
		expect(state.widthKeyframes).toBeGreaterThanOrEqual(2);
		expect(state.heightKeyframes).toBeGreaterThanOrEqual(2);
		expect(state.rotationKeyframes).toBe(2);

		const runtime = await page.evaluate(() =>
			window.electronAPI?.jianyingMotionTracking?.inspect()
		);
		await properties.screenshot({
			path: path.join(evidenceDirectory, "02-motion-tracking-complete.png"),
			animations: "disabled",
		});
		await writeFile(
			path.join(evidenceDirectory, "result.json"),
			`${JSON.stringify({ runtime, sourcePath, state }, null, 2)}\n`,
			{ mode: 0o600 }
		);
	});
});
