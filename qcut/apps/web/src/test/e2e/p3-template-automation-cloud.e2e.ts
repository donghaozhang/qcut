import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestAudio,
	importTestImage,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const artifactDirectory = path.resolve(
	process.cwd(),
	"output/playwright/qcut-p3-template-and-automation"
);

interface HarnessMediaItem {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	url?: string;
	localPath?: string;
	metadata?: Record<string, unknown>;
	file: File;
}

interface HarnessTimelineElement {
	id: string;
	type: string;
	mediaId?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	groupId?: string;
	keyframes?: Record<string, unknown>;
	templateBinding?: {
		instanceId: string;
		slotId: string;
		aspectRatio?: string;
	};
}

interface HarnessTimelineTrack {
	id: string;
	name: string;
	type: string;
	elements: HarnessTimelineElement[];
	transitions?: Array<{
		fromElementId: string;
		toElementId: string;
		type: string;
	}>;
}

interface HarnessTimelineState {
	tracks: HarnessTimelineTrack[];
	addTrack: (type: "captions") => string;
	addElementToTrack: (
		trackId: string,
		element: {
			type: "captions";
			name: string;
			text: string;
			language: string;
			source: "manual";
			startTime: number;
			duration: number;
			trimStart: number;
			trimEnd: number;
		}
	) => string | null;
	setSelectedElements: (
		selection: Array<{ trackId: string; elementId: string }>
	) => void;
}

interface HarnessWindow extends Window {
	__mediaStore: { getState: () => { mediaItems: HarnessMediaItem[] } };
	__timelineStore: { getState: () => HarnessTimelineState };
	__editorStore: {
		getState: () => { canvasSize: { width: number; height: number } };
	};
	__playbackStore: { getState: () => { seek: (time: number) => void } };
}

async function expectNoHorizontalOverflow({
	locator,
}: {
	locator: Locator;
}): Promise<void> {
	await expect(locator).toBeVisible();
	const size = await locator.evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	}));
	expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth + 2);
}

async function waitForTemplateElements({
	page,
	count,
}: {
	page: Page;
	count: number;
}): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as HarnessWindow).__timelineStore
						.getState()
						.tracks.flatMap((track) => track.elements)
						.filter((element) => element.templateBinding).length
			)
		)
		.toBe(count);
}

test.describe("P3 templates, automation, and cloud recovery", () => {
	test("applies templates, Smart Pack, and an aligned digital-human pair", async ({
		page,
		electronApp,
	}) => {
		test.setTimeout(240_000);
		await mkdir(artifactDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await createTestProject(page, "P3 Template Automation");
		await importTestVideo(page);
		await importTestImage(page);
		await importTestAudio(page);

		const sourceMedia = await page.evaluate(() => {
			const items = (window as HarnessWindow).__mediaStore.getState()
				.mediaItems;
			const video = items.find((item) => item.type === "video");
			const image = items.find((item) => item.type === "image");
			const audio = items.find((item) => item.type === "audio");
			if (!video || !image || !audio) {
				throw new Error("Expected imported video, image, and audio fixtures");
			}
			return {
				videoId: video.id,
				videoUrl: video.localPath ?? video.url,
				imageId: image.id,
				imageName: image.name,
				audioId: audio.id,
				audioUrl: audio.localPath ?? audio.url,
			};
		});

		await page.getByTestId("templates-panel-tab").click();
		const templatesPanel = page.getByTestId("templates-panel");
		const workbench = page.getByTestId("timeline-template-workbench");
		await expect(workbench).toBeVisible();
		await workbench
			.getByLabel("Headline")
			.fill("Build once. Tell it everywhere.");
		await workbench.getByLabel("Follow-up").fill("One timeline, every format");
		await expectNoHorizontalOverflow({ locator: templatesPanel });
		await page.screenshot({
			path: path.join(artifactDirectory, "01-template-slots.png"),
			animations: "disabled",
		});

		await workbench.getByTestId("apply-timeline-template").click();
		await waitForTemplateElements({ page, count: 4 });
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as HarnessWindow).__editorStore.getState().canvasSize
				)
			)
			.toEqual({ width: 1080, height: 1920 });

		await workbench.getByRole("button", { name: "16:9", exact: true }).click();
		await workbench.getByTestId("reflow-timeline-template").click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as HarnessWindow).__editorStore.getState().canvasSize
				)
			)
			.toEqual({ width: 1920, height: 1080 });

		await workbench.getByRole("combobox", { name: "Opening shot" }).click();
		await page.getByRole("option", { name: sourceMedia.imageName }).click();
		await workbench
			.getByRole("button", { name: "Replace Opening shot" })
			.click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const elements = (window as HarnessWindow).__timelineStore
						.getState()
						.tracks.flatMap((track) => track.elements);
					return elements.find(
						(element) => element.templateBinding?.slotId === "hero"
					)?.mediaId;
				})
			)
			.toBe(sourceMedia.imageId);
		await page.evaluate(() => {
			(window as HarnessWindow).__playbackStore.getState().seek(1);
		});
		await page.waitForTimeout(250);
		await page.screenshot({
			path: path.join(
				artifactDirectory,
				"02-template-applied-and-reflowed.png"
			),
			animations: "disabled",
		});

		const captions = await page.evaluate(() => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const trackId = timeline.addTrack("captions");
			const firstId = timeline.addElementToTrack(trackId, {
				type: "captions",
				name: "Hook caption",
				text: "This changes the whole workflow!",
				language: "en",
				source: "manual",
				startTime: 0.4,
				duration: 2.6,
				trimStart: 0,
				trimEnd: 0,
			});
			const secondId = timeline.addElementToTrack(trackId, {
				type: "captions",
				name: "Follow-up caption",
				text: "Ready for every channel?",
				language: "en",
				source: "manual",
				startTime: 5.4,
				duration: 2.4,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!firstId || !secondId) throw new Error("Could not create captions");
			return { trackId, firstId, secondId };
		});

		await templatesPanel.getByRole("tab", { name: "Smart Pack" }).click();
		const smartPack = page.getByTestId("smart-pack-panel");
		await expect(smartPack).toBeVisible();
		await expect(
			smartPack.getByText("2", { exact: true }).first()
		).toBeVisible();
		await expectNoHorizontalOverflow({ locator: smartPack });
		await smartPack.getByTestId("apply-smart-pack").click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const tracks = (window as HarnessWindow).__timelineStore.getState()
						.tracks;
					return tracks.filter((track) => track.name.startsWith("Smart "))
						.length;
				})
			)
			.toBeGreaterThanOrEqual(3);

		const smartPackState = await page.evaluate(async () => {
			const timeline = (window as HarnessWindow).__timelineStore.getState();
			const media = (window as HarnessWindow).__mediaStore.getState()
				.mediaItems;
			const generatedTracks = timeline.tracks.filter((track) =>
				track.name.startsWith("Smart ")
			);
			const overlaps = generatedTracks.filter((track) => {
				const sorted = [...track.elements].sort(
					(left, right) => left.startTime - right.startTime
				);
				return sorted.some((element, index) => {
					const next = sorted[index + 1];
					return next
						? element.startTime +
								element.duration -
								element.trimStart -
								element.trimEnd >
								next.startTime + 0.0001
						: false;
				});
			});
			const visualTracks = timeline.tracks.filter(
				(track) => track.type === "media"
			);
			const zoomCount = visualTracks
				.flatMap((track) => track.elements)
				.filter((element) => element.keyframes?.scaleX).length;
			const transitionCount = visualTracks.reduce(
				(total, track) => total + (track.transitions?.length ?? 0),
				0
			);
			const sticker = media.find(
				(item) => item.metadata?.smartPackagingAsset === "spark-burst"
			);
			const sound = media.find(
				(item) => item.metadata?.smartPackagingAsset === "accent-pop"
			);
			const svg = sticker ? await sticker.file.text() : "";
			const wav = sound ? new Uint8Array(await sound.file.arrayBuffer()) : null;
			return {
				overlapTrackNames: overlaps.map((track) => track.name),
				zoomCount,
				transitionCount,
				hasAnimatedSvg: svg.includes("animateTransform"),
				wavHeader: wav ? String.fromCharCode(...wav.slice(0, 4)) : "",
			};
		});
		expect(smartPackState).toMatchObject({
			overlapTrackNames: [],
			hasAnimatedSvg: true,
			wavHeader: "RIFF",
		});
		expect(smartPackState.zoomCount).toBeGreaterThanOrEqual(2);
		expect(smartPackState.transitionCount).toBeGreaterThanOrEqual(1);
		await page.evaluate(() => {
			(window as HarnessWindow).__playbackStore.getState().seek(1);
		});
		await page.waitForTimeout(250);
		await page.screenshot({
			path: path.join(artifactDirectory, "03-smart-package-timeline.png"),
			animations: "allow",
		});

		await electronApp.evaluate(
			async ({ ipcMain, BrowserWindow }, outputIds) => {
				type GenerateOptions = {
					command: string;
					args: Record<string, string | number | boolean>;
					sessionId?: string;
				};
				const state = globalThis as typeof globalThis & {
					__qcutP3PipelineCalls?: GenerateOptions[];
				};
				state.__qcutP3PipelineCalls = [];
				for (const channel of [
					"ai-pipeline:check",
					"ai-pipeline:status",
					"ai-pipeline:generate",
					"ai-pipeline:cancel",
				]) {
					ipcMain.removeHandler(channel);
				}
				ipcMain.handle("ai-pipeline:check", async () => ({ available: true }));
				ipcMain.handle("ai-pipeline:status", async () => ({
					available: true,
					version: "e2e",
					source: "native",
					compatible: true,
					features: { speechGeneration: true, avatarGeneration: true },
				}));
				ipcMain.handle(
					"ai-pipeline:generate",
					async (_event, options: GenerateOptions) => {
						state.__qcutP3PipelineCalls?.push(options);
						BrowserWindow.getAllWindows()[0]?.webContents.send(
							"ai-pipeline:progress",
							{
								sessionId: options.sessionId,
								stage: "generating",
								percent: 72,
								message:
									options.command === "generate-speech"
										? "Synthesizing speech"
										: "Rendering digital human",
							}
						);
						return options.command === "generate-speech"
							? {
									success: true,
									mediaId: outputIds.audioId,
									outputPath: outputIds.audioUrl,
									cost: 0.01,
								}
							: {
									success: true,
									mediaId: outputIds.videoId,
									outputPath: outputIds.videoUrl,
									cost: 0.21,
								};
					}
				);
				ipcMain.handle("ai-pipeline:cancel", async () => ({ success: true }));
			},
			{
				audioId: sourceMedia.audioId,
				audioUrl: sourceMedia.audioUrl,
				videoId: sourceMedia.videoId,
				videoUrl: sourceMedia.videoUrl,
			}
		);

		await page.evaluate(({ trackId, firstId }) => {
			(window as HarnessWindow).__timelineStore
				.getState()
				.setSelectedElements([{ trackId, elementId: firstId }]);
		}, captions);
		const captionProperties = page.getByTestId("caption-properties");
		await expect(captionProperties).toBeVisible();
		await captionProperties.getByRole("tab", { name: "Avatar" }).click();
		await captionProperties.getByRole("combobox", { name: "Portrait" }).click();
		await page.getByRole("option", { name: sourceMedia.imageName }).click();
		await captionProperties.getByTestId("generate-aligned-avatar").click();
		const cloudStatus = captionProperties.getByTestId("cloud-task-status");
		await expect
			.poll(() => cloudStatus.getAttribute("data-task-status"))
			.toMatch(/completed|failed/);
		await expect(cloudStatus).toHaveAttribute("data-task-status", "completed");

		const alignedState = await page.evaluate(() => {
			const tracks = (window as HarnessWindow).__timelineStore.getState()
				.tracks;
			const speech = tracks.find((track) => track.name === "Aligned Speech");
			const avatar = tracks.find(
				(track) => track.name === "Aligned Digital Human"
			);
			return {
				speech: speech?.elements[0],
				avatar: avatar?.elements[0],
			};
		});
		expect(alignedState.speech).toMatchObject({
			startTime: 0.4,
			duration: 2.6,
		});
		expect(alignedState.avatar).toMatchObject({
			startTime: 0.4,
			duration: 2.6,
			groupId: alignedState.speech?.groupId,
		});
		const pipelineCalls = await electronApp.evaluate(() => {
			const state = globalThis as typeof globalThis & {
				__qcutP3PipelineCalls?: Array<{
					command: string;
					args: Record<string, string | number | boolean>;
				}>;
			};
			return state.__qcutP3PipelineCalls ?? [];
		});
		expect(pipelineCalls.map((call) => call.command)).toEqual([
			"generate-speech",
			"generate-avatar",
		]);
		expect(pipelineCalls[1]?.args["audio-url"]).toBe(sourceMedia.audioUrl);
		await expectNoHorizontalOverflow({ locator: captionProperties });
		await page.evaluate(() => {
			(window as HarnessWindow).__playbackStore.getState().seek(1);
		});
		await page.waitForTimeout(250);
		await page.screenshot({
			path: path.join(artifactDirectory, "04-cloud-task-and-avatar.png"),
			animations: "disabled",
		});
	});
});
