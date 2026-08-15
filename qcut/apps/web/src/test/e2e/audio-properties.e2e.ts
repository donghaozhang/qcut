import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestAudio,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDir =
	process.env.QCUT_AUDIO_AUDIT_DIR ??
	path.join(process.env.TMPDIR ?? "/tmp", "qcut-audio-visual-audit");

async function addAudioToTimeline({ page }: { page: Page }) {
	const mediaItem = page
		.getByTestId("media-item")
		.filter({ hasText: /sample-audio/i })
		.first();
	await expect(mediaItem).toBeVisible();
	await mediaItem.hover();
	await mediaItem.locator("button").first().click({ force: true });
	await expect(
		page.locator(
			'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
		)
	).toHaveCount(1);
}

async function addVideoToTimeline({ page }: { page: Page }) {
	const mediaItem = page
		.getByTestId("media-item")
		.filter({ hasText: /sample-video/i })
		.first();
	await expect(mediaItem).toBeVisible();
	await mediaItem.hover();
	await mediaItem.locator("button").first().click({ force: true });
	await expect(
		page.locator(
			'[data-testid="timeline-track"][data-track-type="media"] [data-testid="timeline-element"]'
		)
	).toHaveCount(1);
	await mediaItem.click({ force: true });
}

async function setAudioNumber({
	page,
	label,
	value,
}: {
	page: Page;
	label: string;
	value: number;
}) {
	const input = page.getByLabel(`${label}数值`);
	await input.fill(String(value));
	await input.press("Tab");
}

test.describe("Professional audio properties", () => {
	test("routes every audio selection path to one Sound panel and batch mode", async ({
		page,
	}) => {
		await createTestProject(page, "Audio Selection Routing");
		await importTestAudio(page);
		await addAudioToTimeline({ page });
		await page.evaluate(() => {
			const store = (window as any).__timelineStore;
			const track = store
				.getState()
				.tracks.find((candidate: any) => candidate.type === "audio");
			const source = track.elements[0];
			store
				.getState()
				.addElementToTrack(
					track.id,
					{ ...source, startTime: source.startTime + source.duration },
					{ pushHistory: true, selectElement: false }
				);
		});
		const clips = page.locator(
			'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
		);
		await expect(clips).toHaveCount(2);

		await clips.first().click();
		await expect(page.getByTestId("audio-properties-panel")).toBeVisible();
		// The export view opens only from the header button; the panel tab
		// appears just while that view is active.
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("panel-tab-export")).toHaveClass(
			/border-primary/
		);

		await page.evaluate(() => {
			const store = (window as any).__timelineStore;
			const track = store
				.getState()
				.tracks.find((candidate: any) => candidate.type === "audio");
			store
				.getState()
				.setSelectedElements([
					{ trackId: track.id, elementId: track.elements[1].id },
				]);
		});
		await expect(page.getByTestId("panel-tab-properties")).toHaveClass(
			/border-primary/
		);
		await expect(page.getByTestId("audio-properties-panel")).toBeVisible();

		await page.evaluate(() => {
			const store = (window as any).__timelineStore;
			const track = store
				.getState()
				.tracks.find((candidate: any) => candidate.type === "audio");
			store.getState().setSelectedElements(
				track.elements.map((element: any) => ({
					trackId: track.id,
					elementId: element.id,
				}))
			);
		});
		await expect(
			page.getByTestId("audio-multi-selection-properties")
		).toContainText("2 audio clips");

		await page.evaluate(() => {
			const store = (window as any).__timelineStore;
			const track = store
				.getState()
				.tracks.find((candidate: any) => candidate.type === "audio");
			store
				.getState()
				.setSelectedElements([
					{ trackId: track.id, elementId: track.elements[1].id },
				]);
		});
		await clips.first().click({ button: "right" });
		await expect(page.getByTestId("audio-properties-panel")).toBeVisible();
	});

	test("shares the full panel with audio clips and previews keyframed effects", async ({
		page,
	}) => {
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
		await createTestProject(page, "Professional Audio Audit");
		await importTestAudio(page);
		await addAudioToTimeline({ page });

		const clip = page.locator(
			'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
		);
		await clip.click();
		await page.getByTestId("panel-tab-properties").click();
		const panel = page.getByTestId("audio-properties-panel");
		await expect(panel).toBeVisible();
		await expect(panel.getByRole("tab")).toHaveCount(5);
		await panel.getByTestId("audio-preview-playback").click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as any).__playbackStore.getState().isPlaying
				)
			)
			.toBe(true);
		await panel.getByTestId("audio-preview-playback").click();
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as any).__playbackStore.getState().isPlaying
				)
			)
			.toBe(false);

		await setAudioNumber({ page, label: "音量", value: 6 });
		await panel.getByLabel("添加音量关键帧").click();
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const element = timeline.tracks
				.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			(window as any).__playbackStore.getState().seek(element.startTime + 1);
		});
		await setAudioNumber({ page, label: "音量", value: -6 });
		await expect(panel.getByLabel("上一个音量关键帧")).toBeEnabled();
		await panel.getByLabel("上一个音量关键帧").click();

		const keyframeState = await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			return {
				volumeDb: element.audio.volumeDb,
				legacyVolume: element.volume,
				keyframes: element.audio.keyframes.volumeDb,
			};
		});
		expect(keyframeState.volumeDb).toBe(6);
		expect(keyframeState.legacyVolume).toBeCloseTo(1.9953, 3);
		expect(keyframeState.keyframes).toHaveLength(2);
		expect(
			keyframeState.keyframes.map(
				(keyframe: { value: number }) => keyframe.value
			)
		).toEqual([6, -6]);

		await panel.screenshot({
			path: path.join(outputDir, "01-audio-basic-keyframes.png"),
			animations: "disabled",
		});

		const denoiseModule = panel.getByTestId("audio-module-denoise");
		await panel.getByLabel("启用降噪").click();
		await denoiseModule.locator("summary").click();
		await denoiseModule.getByLabel("AI 人声降噪").click();
		await expect(
			denoiseModule.getByRole("button", { name: "开始处理" })
		).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "02-audio-ai-denoise.png"),
			animations: "disabled",
		});

		await expect(panel.getByTestId("audio-module-separation")).toBeVisible();
		await panel.getByLabel("启用人声增强").click();
		await panel
			.getByTestId("audio-module-voice-enhance")
			.locator("summary")
			.click();
		await setAudioNumber({ page, label: "清晰度", value: 35 });
		await panel.getByLabel("启用音调").click();
		await panel.getByTestId("audio-module-pitch").locator("summary").click();
		await setAudioNumber({ page, label: "音调", value: 3 });
		await page.mouse.move(4, 4);
		await page.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		});
		await page.waitForTimeout(250);
		await panel.screenshot({
			path: path.join(outputDir, "03-audio-basic-processing.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "人声" }).click();
		await expect(
			panel.getByTestId("audio-voice-preset-controls")
		).toBeVisible();
		await expect(
			panel.getByTestId("audio-module-voice-conversion")
		).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "04-audio-voice.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "音效" }).click();
		await expect(panel.getByTestId("audio-preset-controls")).toBeVisible();
		await panel.getByLabel("启用均衡器").click();
		await setAudioNumber({ page, label: "低频", value: 4 });
		await panel.getByLabel("启用压缩器").click();
		await panel.getByLabel("启用限制器").click();
		await panel.screenshot({
			path: path.join(outputDir, "05-audio-effects.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "变速" }).click();
		await expect(panel.getByTestId("audio-speed-preserve-pitch")).toContainText(
			"已开启"
		);
		await setAudioNumber({ page, label: "倍速", value: 2 });
		await panel.screenshot({
			path: path.join(outputDir, "06-audio-speed.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "歌词" }).click();
		await expect(panel.getByTestId("audio-lyrics-settings")).toBeVisible();
		await expect(panel.getByTestId("audio-cover-settings")).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "07-audio-lyrics-cover.png"),
			animations: "disabled",
		});
		const panelWidth = await panel.evaluate((node) => ({
			clientWidth: node.clientWidth,
			scrollWidth: node.scrollWidth,
		}));
		expect(panelWidth.scrollWidth).toBeLessThanOrEqual(panelWidth.clientWidth);

		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const captionTrackId = timeline.addTrack("captions");
			timeline.addElementToTrack(
				captionTrackId,
				{
					type: "captions",
					name: "Karaoke preview",
					startTime: 0,
					duration: 2,
					trimStart: 0,
					trimEnd: 0,
					text: "Hello world",
					language: "en",
					source: "transcription",
					style: {
						karaokeMode: "karaoke",
						highlightColor: "#22d3ee",
						upcomingColor: "#d4d4d8",
					},
					words: [
						{
							id: "hello",
							text: "Hello",
							start: 0,
							end: 1,
							type: "word",
						},
						{
							id: "world",
							text: "world",
							start: 1,
							end: 2,
							type: "word",
						},
					],
				},
				{ pushHistory: false, selectElement: false }
			);
			(window as any).__playbackStore.getState().seek(0.5);
		});
		await expect(page.getByTestId("karaoke-renderer")).toContainText("Hello");
		await expect(page.getByTestId("karaoke-renderer")).toContainText("world");
		await page
			.getByTestId("preview-panel")
			.first()
			.screenshot({
				path: path.join(outputDir, "08-karaoke-preview.png"),
				animations: "disabled",
			});

		const previewAudio = page.locator('audio[data-audio-preview="web-audio"]');
		await expect
			.poll(() =>
				previewAudio.evaluate((audio) => ({
					mode: audio.dataset.audioPreview,
					gain: Number(audio.dataset.audioPreviewGain),
					volume: audio.volume,
					effects: audio.dataset.audioPreviewEffects,
					pitch: audio.dataset.audioPreviewPitch,
					pitchRate: audio.dataset.audioPreviewPitchRate,
				}))
			)
			.toMatchObject({
				mode: "web-audio",
				volume: 1,
				effects: "denoise,voice,equalizer,compressor,limiter",
				pitch: "formant",
				pitchRate: "2.0000",
			});
		const previewGain = await previewAudio.evaluate((audio) =>
			Number(audio.dataset.audioPreviewGain)
		);
		expect(previewGain).toBeGreaterThan(1);

		await panel.getByTestId("audio-preview-bypass").click();
		await expect
			.poll(() =>
				previewAudio.evaluate((audio) => ({
					effects: audio.dataset.audioPreviewEffects,
					pitch: audio.dataset.audioPreviewPitch,
				}))
			)
			.toEqual({ effects: "", pitch: "off" });
		await panel.getByTestId("audio-preview-bypass").click();
		await expect
			.poll(() =>
				previewAudio.evaluate((audio) => audio.dataset.audioPreviewEffects)
			)
			.toBe("denoise,voice,equalizer,compressor,limiter");

		const finalState = await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			return element.audio;
		});
		expect(finalState.voiceEnhance).toMatchObject({
			enabled: true,
			clarity: 35,
		});
		expect(finalState.pitch).toMatchObject({ enabled: true, semitones: 3 });
		expect(finalState.equalizer).toMatchObject({ enabled: true, lowGainDb: 4 });
		expect(finalState.compressor.enabled).toBe(true);
		expect(finalState.limiter.enabled).toBe(true);
		const playbackRate = await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			return element.playbackRate;
		});
		expect(playbackRate).toBe(2);

		await panel.getByTestId("audio-reset-all").click();
		const resetState = await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			return {
				volumeDb: element.audio.volumeDb,
				equalizerEnabled: element.audio.equalizer.enabled,
				playbackRate: element.playbackRate,
			};
		});
		expect(resetState).toEqual({
			volumeDb: 0,
			equalizerEnabled: false,
			playbackRate: 2,
		});
	});

	test("pre-renders preserved formants before native FFmpeg export", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(180_000);
		await rm("/tmp/qcut-formant-export-e2e.mp4", { force: true });
		await createTestProject(page, "Formant Export Audit");
		await importTestVideo(page);
		await addVideoToTimeline({ page });
		await importTestAudio(page);
		await addAudioToTimeline({ page });
		const clip = page.locator(
			'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
		);
		await clip.click();
		await page.getByTestId("panel-tab-properties").click();
		const panel = page.getByTestId("audio-properties-panel");
		await panel.getByLabel("启用音调").click();
		await panel.getByTestId("audio-module-pitch").locator("summary").click();
		await setAudioNumber({ page, label: "音调", value: 7 });
		await expect(panel.getByLabel("保留共振峰")).toBeChecked();
		await electronApp.evaluate(async ({ dialog }) => {
			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: "/tmp/qcut-formant-export-e2e.mp4",
			});
		});

		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await page.getByTestId("export-start-button").click();
		await expect
			.poll(
				async () => {
					try {
						return (await stat("/tmp/qcut-formant-export-e2e.mp4")).size;
					} catch {
						return 0;
					}
				},
				{ timeout: 180_000, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(1_000);
	});
});
