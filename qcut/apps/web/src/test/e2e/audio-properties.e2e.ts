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
	const input = page.getByLabel(`${label} value`);
	await input.fill(String(value));
	await input.press("Tab");
}

test.describe("Professional audio properties", () => {
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
		await expect(panel.getByRole("tab")).toHaveCount(3);

		await setAudioNumber({ page, label: "Volume", value: 6 });
		await panel.getByLabel("Add Volume keyframe").click();
		await page.evaluate(() => {
			const timeline = (window as any).__timelineStore.getState();
			const element = timeline.tracks
				.flatMap((track: any) => track.elements)
				.find((candidate: any) => candidate.type === "media");
			(window as any).__playbackStore.getState().seek(element.startTime + 1);
		});
		await setAudioNumber({ page, label: "Volume", value: -6 });
		await expect(panel.getByLabel("Previous Volume keyframe")).toBeEnabled();
		await panel.getByLabel("Previous Volume keyframe").click();

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
		await panel.getByLabel("Enable Noise reduction").click();
		await denoiseModule.locator("summary").click();
		await denoiseModule.getByLabel("AI speech denoise").click();
		await expect(
			denoiseModule.getByRole("button", { name: "Process" })
		).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "02-audio-ai-denoise.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "Voice" }).click();
		await expect(panel.getByTestId("audio-module-separation")).toBeVisible();
		await expect(
			panel.getByTestId("audio-module-voice-conversion")
		).toBeVisible();
		await panel.getByLabel("Enable Voice enhancement").click();
		await setAudioNumber({ page, label: "Clarity", value: 35 });
		await panel.getByLabel("Enable Pitch").click();
		await panel.getByTestId("audio-module-pitch").locator("summary").click();
		await setAudioNumber({ page, label: "Pitch", value: 3 });
		await page.evaluate(() => {
			(window as any).__playbackStore.getState().setSpeed(2);
		});
		await panel.screenshot({
			path: path.join(outputDir, "03-audio-voice.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "Effects" }).click();
		await panel.getByLabel("Enable Equalizer").click();
		await setAudioNumber({ page, label: "Low EQ", value: 4 });
		await panel.getByLabel("Enable Compressor").click();
		await panel.getByLabel("Enable Limiter").click();
		await panel.screenshot({
			path: path.join(outputDir, "04-audio-effects.png"),
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
		await panel.getByRole("tab", { name: "Voice" }).click();
		await panel.getByLabel("Enable Pitch").click();
		await panel.getByTestId("audio-module-pitch").locator("summary").click();
		await setAudioNumber({ page, label: "Pitch", value: 7 });
		await expect(panel.getByLabel("Preserve formants")).toBeChecked();
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
