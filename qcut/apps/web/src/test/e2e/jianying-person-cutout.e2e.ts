import { _electron as electron } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import {
	createTestProject,
	navigateToProjects,
} from "./helpers/electron-helpers";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";

const sourcePath =
	process.env.QCUT_PERSON_VIDEO_PATH ??
	"/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/real-person-input-2s.mp4";
const evidenceDirectory =
	process.env.QCUT_PERSON_CUTOUT_EVIDENCE_DIRECTORY ??
	"/Users/peter/Desktop/improve_voice/qcut-gru-real-person-test-2026-08-26/qcut-desktop-e2e-native-metal";
const outputPath = join(evidenceDirectory, "desktop-person-cutout.webm");
const expectedRoute =
	process.env.QCUT_PERSON_CUTOUT_EXPECTED_ROUTE ?? "portrait-gru";
const expectedBlendImplementation =
	expectedRoute === "portrait-gru"
		? "TEMattingBlendEffectV2-native-metal"
		: "TEMattingBlendEffectV2-compatible";

interface CutoutMediaItem {
	id: string;
	duration: number;
	file: File;
	height: number;
	metadata?: {
		blendImplementation?: string;
		hasAlpha?: boolean;
		source?: string;
	};
	width: number;
}

interface CutoutHarnessWindow extends Window {
	__mediaStore: {
		getState: () => { mediaItems: CutoutMediaItem[] };
	};
	__timelineStore: {
		getState: () => {
			setSelectedElements: (
				elements: Array<{ trackId: string; elementId: string }>
			) => void;
			tracks: Array<{
				elements: Array<{
					id: string;
					masks?: Array<{
						sourceMediaId?: string;
						tracking?: { source?: string };
						type: string;
					}>;
					startTime: number;
					type: string;
				}>;
			}>;
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
	electronAPI: {
		writeFile: (path: string, bytes: ArrayBuffer) => Promise<boolean>;
	};
}

test.describe("Jianying-routed local person cutout", () => {
	test.setTimeout(180_000);
	test.skip(!existsSync(sourcePath), "Real-person video fixture is missing");

	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixtures before testInfo.
	test("renders, attaches, and plays a routed native mask in QCut", async ({}, testInfo) => {
		const profileDirectory = join(
			tmpdir(),
			`qcut-jianying-person-cutout-${process.pid}-${Date.now()}`
		);
		await rm(evidenceDirectory, { recursive: true, force: true });
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
			await createTestProject(page, "Native Metal Person Cutout E2E");
			await uploadTestMedia(page, sourcePath);
			await page
				.getByTestId("media-item")
				.last()
				.dragTo(page.getByTestId("timeline-track").first());
			const timelineClip = page.getByTestId("timeline-element").last();
			await expect(timelineClip).toBeVisible();
			await timelineClip.click();
			const properties = page.getByTestId("media-properties");
			await expect(properties).toBeVisible();
			await properties
				.getByTestId("media-properties-visual-tabs")
				.getByRole("tab", { name: "抠像", exact: true })
				.click();
			await expect(
				properties.getByTestId("person-cutout-quality-fine")
			).toBeVisible();
			await properties.getByTestId("person-cutout-quality-fine").click();
			await properties
				.getByTestId("person-cutout-quality")
				.locator("..")
				.locator("summary")
				.click();
			await expect(properties.getByText("精细抠像已就绪")).toBeVisible({
				timeout: 30_000,
			});
			await properties.screenshot({
				path: join(evidenceDirectory, "01-fine-cutout-ready.png"),
				animations: "disabled",
			});

			await properties.getByRole("button", { name: "开始并应用" }).click();
			await expect(properties.getByTestId("person-cutout-result")).toBeVisible({
				timeout: 120_000,
			});
			const exported = await page.evaluate(async (destination) => {
				const harness = window as unknown as CutoutHarnessWindow;
				const item = [...harness.__mediaStore.getState().mediaItems]
					.reverse()
					.find(
						(candidate) =>
							candidate.metadata?.source === "jianying-gru-person-cutout"
					);
				if (!item) throw new Error("Native person cutout was not added");
				const written = await harness.electronAPI.writeFile(
					destination,
					await item.file.arrayBuffer()
				);
				const mask = harness.__timelineStore
					.getState()
					.tracks.flatMap((track) => track.elements)
					.flatMap((element) => element.masks ?? [])
					.find((candidate) => candidate.sourceMediaId === item.id);
				return {
					blendImplementation: item.metadata?.blendImplementation,
					duration: item.duration,
					hasAlpha: item.metadata?.hasAlpha,
					height: item.height,
					mask,
					outputMediaId: item.id,
					size: item.file.size,
					width: item.width,
					written,
				};
			}, outputPath);
			expect(exported).toMatchObject({
				blendImplementation: expectedBlendImplementation,
				hasAlpha: true,
				height: 640,
				mask: {
					height: 1,
					sourceMediaId: exported.outputMediaId,
					tracking: { source: "jianying-gru" },
					type: "person",
					width: 1,
				},
				width: 360,
				written: true,
			});
			expect(exported.duration).toBeGreaterThan(
				expectedRoute === "saliency-script" ? 0.4 : 1.5
			);
			expect(exported.size).toBeGreaterThan(10_000);
			await page.evaluate((sourceMediaId) => {
				const harness = window as unknown as CutoutHarnessWindow;
				const element = harness.__timelineStore
					.getState()
					.tracks.flatMap((track) => track.elements)
					.find((candidate) =>
						candidate.masks?.some(
							(mask) => mask.sourceMediaId === sourceMediaId
						)
					);
				if (!element) throw new Error("Masked timeline clip is missing");
				harness.__playbackStore.getState().seek(element.startTime + 0.25);
			}, exported.outputMediaId);

			const previewPanel = page.getByTestId("preview-panel");
			const maskVideo = previewPanel.locator(
				'video[data-video-id*="-mask-"]:not([data-video-id$="-mask-audio"])'
			);
			await expect(maskVideo).toHaveCount(1);
			await expect
				.poll(
					() =>
						maskVideo.evaluate(
							(video) => (video as HTMLVideoElement).readyState
						),
					{ timeout: 30_000 }
				)
				.toBeGreaterThanOrEqual(2);
			await expect
				.poll(() =>
					maskVideo.evaluate((video) => (video as HTMLVideoElement).videoWidth)
				)
				.toBe(360);
			let decodedAlphaStats:
				| { centerMean: number; topBandMean: number }
				| undefined;
			if (basename(sourcePath) === "real-person-wide-2s.mp4") {
				decodedAlphaStats = await maskVideo.evaluate((element) => {
					const video = element as HTMLVideoElement;
					const canvas = document.createElement("canvas");
					canvas.width = video.videoWidth;
					canvas.height = video.videoHeight;
					const context = canvas.getContext("2d", { willReadFrequently: true });
					if (!context) throw new Error("Unable to inspect decoded alpha");
					context.drawImage(video, 0, 0);
					const pixels = context.getImageData(
						0,
						0,
						canvas.width,
						canvas.height
					).data;
					let topBandAlpha = 0;
					for (let y = 0; y < 32; y += 1) {
						for (let x = 0; x < canvas.width; x += 1) {
							topBandAlpha += pixels[(y * canvas.width + x) * 4 + 3];
						}
					}
					let centerAlpha = 0;
					for (let y = 160; y < 480; y += 1) {
						for (let x = 90; x < 270; x += 1) {
							centerAlpha += pixels[(y * canvas.width + x) * 4 + 3];
						}
					}
					return {
						centerMean: centerAlpha / (180 * 320),
						topBandMean: topBandAlpha / (canvas.width * 32),
					};
				});
				expect(decodedAlphaStats.topBandMean).toBeLessThan(1);
				expect(decodedAlphaStats.centerMean).toBeGreaterThan(100);
			}
			await properties.screenshot({
				path: join(evidenceDirectory, "02-cutout-completed.png"),
				animations: "disabled",
			});
			await page.evaluate(() => {
				const harness = window as unknown as CutoutHarnessWindow;
				harness.__timelineStore.getState().setSelectedElements([]);
			});
			await previewPanel.screenshot({
				path: join(evidenceDirectory, "03-mask-playing-in-preview.png"),
				animations: "disabled",
			});
			await writeFile(
				join(evidenceDirectory, "e2e-evidence.json"),
				`${JSON.stringify(
					{
						...exported,
						decodedAlphaStats,
						expectedRoute,
						outputPath,
						sourcePath,
						testOutputDirectory: testInfo.outputDir,
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
