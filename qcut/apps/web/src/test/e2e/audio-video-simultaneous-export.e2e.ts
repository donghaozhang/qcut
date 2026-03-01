import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestAudio,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const TEST_TIMEOUT_MS = 180_000;
const EXPORT_COMPLETION_TIMEOUT_MS = 60_000;

type StreamValidationSuccess = {
	audioExtractionFileSize: number;
	ok: true;
	outputPath: string;
	videoBlobSize: number;
};

type StreamValidationFailure = {
	error: string;
	ok: false;
};

type StreamValidationResult = StreamValidationSuccess | StreamValidationFailure;

async function addMediaItemToTimeline({
	itemNamePattern,
	page,
	trackType,
}: {
	itemNamePattern: RegExp;
	page: Page;
	trackType: "audio" | "media";
}) {
	try {
		const mediaItem = page
			.locator('[data-testid="media-item"]')
			.filter({ hasText: itemNamePattern })
			.first();

		await expect(mediaItem).toBeVisible({ timeout: 15_000 });
		const timelineElementsBefore = await page.evaluate((targetType) => {
			const tracks = Array.from(
				document.querySelectorAll('[data-testid="timeline-track"]')
			);
			let count = 0;
			for (const track of tracks) {
				if (track.getAttribute("data-track-type") !== targetType) {
					continue;
				}
				count += track.querySelectorAll(
					'[data-testid="timeline-element"]'
				).length;
			}
			return count;
		}, trackType);

		const hasTargetTrack = await page
			.locator(`[data-testid="timeline-track"][data-track-type="${trackType}"]`)
			.first()
			.isVisible()
			.catch(() => false);

		if (trackType === "audio" && !hasTargetTrack) {
			await mediaItem.hover();
			await mediaItem.locator("button").first().click({ force: true });
		} else {
			const targetTrack = page
				.locator(
					`[data-testid="timeline-track"][data-track-type="${trackType}"]`
				)
				.first();
			await expect(targetTrack).toBeVisible({ timeout: 15_000 });
			await mediaItem.dragTo(targetTrack);
		}

		await expect
			.poll(
				async () => {
					return await page.evaluate((targetType) => {
						const tracks = Array.from(
							document.querySelectorAll('[data-testid="timeline-track"]')
						);
						let count = 0;
						for (const track of tracks) {
							if (track.getAttribute("data-track-type") !== targetType) {
								continue;
							}
							count += track.querySelectorAll(
								'[data-testid="timeline-element"]'
							).length;
						}
						return count;
					}, trackType);
				},
				{ timeout: 10_000 }
			)
			.toBeGreaterThan(timelineElementsBefore);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to add media item to timeline: ${message}`);
	}
}

async function installExportBlobCapture({ page }: { page: Page }) {
	try {
		await page.evaluate(() => {
			type WindowWithExportCapture = Window & {
				__qcutCapturedExportBlob?: Blob | null;
				__qcutCreateObjectURLOriginal?: (object: Blob | MediaSource) => string;
				__qcutLastExportOutputPath?: string | null;
			};

			type ElectronAPIWithExport = {
				ffmpeg?: {
					exportVideoCLI?: (options: unknown) => Promise<{
						outputFile?: string;
						outputPath?: string;
						success?: boolean;
					}>;
				};
			};

			const globalWindow = window as WindowWithExportCapture;
			const electronAPI = (
				window as Window & { electronAPI?: ElectronAPIWithExport }
			).electronAPI;

			if (!globalWindow.__qcutCreateObjectURLOriginal) {
				globalWindow.__qcutCreateObjectURLOriginal =
					URL.createObjectURL.bind(URL);

				URL.createObjectURL = (object: Blob | MediaSource): string => {
					if (object instanceof Blob && object.type.startsWith("video/")) {
						globalWindow.__qcutCapturedExportBlob = object;
					}

					const createObjectURL = globalWindow.__qcutCreateObjectURLOriginal;
					if (!createObjectURL) {
						throw new Error("Missing createObjectURL original reference");
					}
					return createObjectURL(object);
				};
			}

			globalWindow.__qcutCapturedExportBlob = null;
			globalWindow.__qcutLastExportOutputPath = null;

			const ffmpegApi = electronAPI?.ffmpeg;
			if (
				ffmpegApi?.exportVideoCLI &&
				!(ffmpegApi as { __qcutWrapped?: boolean }).__qcutWrapped
			) {
				const originalExport = ffmpegApi.exportVideoCLI.bind(ffmpegApi);
				ffmpegApi.exportVideoCLI = async (options: unknown) => {
					const result = await originalExport(options);
					const outputPath = result.outputFile || result.outputPath || null;
					globalWindow.__qcutLastExportOutputPath = outputPath;
					return result;
				};
				(ffmpegApi as { __qcutWrapped?: boolean }).__qcutWrapped = true;
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to install export blob capture: ${message}`);
	}
}

async function selectCliEngineAndEnableAudio({ page }: { page: Page }) {
	try {
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible({
			timeout: 10_000,
		});

		const cliEngineOption = page.locator('label[for="cli"]').first();
		if (await cliEngineOption.isVisible().catch(() => false)) {
			await cliEngineOption.click();
		}

		const includeAudioCheckbox = page
			.locator('[data-testid="export-include-audio-checkbox"], #include-audio')
			.first();
		await expect(includeAudioCheckbox).toBeVisible({ timeout: 10_000 });

		const isChecked = await includeAudioCheckbox.evaluate((node) => {
			if (node instanceof HTMLInputElement) {
				return node.checked;
			}

			const state = node.getAttribute("data-state");
			if (state === "checked") {
				return true;
			}

			return node.getAttribute("aria-checked") === "true";
		});

		if (!isChecked) {
			await includeAudioCheckbox.click();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to configure export settings: ${message}`);
	}
}

async function startExportAndWaitForCompletion({
	consoleMessages,
	page,
}: {
	consoleMessages: string[];
	page: Page;
}) {
	try {
		const startExportButton = page.getByTestId("export-start-button");
		await expect(startExportButton).toBeVisible({ timeout: 10_000 });
		await expect(startExportButton).toBeEnabled({ timeout: 10_000 });
		await startExportButton.click();

		await expect
			.poll(
				async () =>
					consoleMessages.some((message) =>
						message.includes("Starting FFmpeg CLI export process")
					),
				{ timeout: 20_000 }
			)
			.toBe(true);

		await expect
			.poll(
				async () =>
					consoleMessages.some((message) =>
						message.includes("FFmpeg export completed in")
					),
				{ timeout: EXPORT_COMPLETION_TIMEOUT_MS }
			)
			.toBe(true);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Export did not complete successfully: ${message}`);
	}
}

async function validateCapturedExportHasAudioAndVideo({
	page,
}: {
	page: Page;
}): Promise<StreamValidationResult> {
	try {
		return await page.evaluate(async () => {
			type ElectronAPIForValidation = {
				video?: {
					saveTemp: (
						videoData: Uint8Array,
						filename: string,
						sessionId?: string
					) => Promise<string>;
				};
				ffmpeg?: {
					extractAudio?: (options: {
						format?: string;
						videoPath: string;
					}) => Promise<{
						audioPath: string;
						fileSize: number;
					}>;
				};
			};

			type WindowWithCapture = Window & {
				__qcutCapturedExportBlob?: Blob | null;
				__qcutLastExportOutputPath?: string | null;
				electronAPI?: ElectronAPIForValidation;
			};

			const globalWindow = window as WindowWithCapture;
			const exportBlob = globalWindow.__qcutCapturedExportBlob;
			if (!exportBlob) {
				return {
					error: "Export blob was not captured",
					ok: false,
				} satisfies StreamValidationFailure;
			}

			const electronAPI = globalWindow.electronAPI;
			if (!electronAPI?.video?.saveTemp || !electronAPI?.ffmpeg?.extractAudio) {
				return {
					error:
						"Electron video.saveTemp or ffmpeg.extractAudio method is unavailable",
					ok: false,
				} satisfies StreamValidationFailure;
			}

			const blobBytes = new Uint8Array(await exportBlob.arrayBuffer());
			const outputPath = await electronAPI.video.saveTemp(
				blobBytes,
				`e2e-export-output-${Date.now()}.mp4`
			);

			const extracted = await electronAPI.ffmpeg.extractAudio({
				format: "wav",
				videoPath: outputPath,
			});

			return {
				audioExtractionFileSize: extracted.fileSize,
				ok: true,
				outputPath,
				videoBlobSize: exportBlob.size,
			} satisfies StreamValidationSuccess;
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			error: `Failed to validate exported stream data: ${message}`,
			ok: false,
		};
	}
}

test.describe("Audio + Video Simultaneous Export", () => {
	test("exports both streams when timeline has separate video and audio tracks", async ({
		page,
	}) => {
		test.setTimeout(TEST_TIMEOUT_MS);

		try {
			const consoleMessages: string[] = [];
			page.on("console", (message) => {
				consoleMessages.push(message.text());
			});

			await createTestProject(page, "E2E Audio Video Simultaneous Export");

			// Enable debug mode so debugLog() messages appear in the console
			await page.evaluate(() => {
				localStorage.setItem("qcut_debug_mode", "true");
			});

			await importTestVideo(page);
			await importTestAudio(page);

			await addMediaItemToTimeline({
				itemNamePattern: /sample-video/i,
				page,
				trackType: "media",
			});
			await addMediaItemToTimeline({
				itemNamePattern: /sample-audio/i,
				page,
				trackType: "audio",
			});

			const timelineSummary = await page.evaluate(() => {
				const tracks = Array.from(
					document.querySelectorAll('[data-testid="timeline-track"]')
				);
				const summary = {
					audioTrackElements: 0,
					mediaTrackElements: 0,
				};

				for (const track of tracks) {
					const elementCount = track.querySelectorAll(
						'[data-testid="timeline-element"]'
					).length;
					const trackType = track.getAttribute("data-track-type");

					if (trackType === "audio") {
						summary.audioTrackElements += elementCount;
					}

					if (trackType === "media") {
						summary.mediaTrackElements += elementCount;
					}
				}

				return summary;
			});

			expect(timelineSummary.audioTrackElements).toBeGreaterThan(0);
			expect(timelineSummary.mediaTrackElements).toBeGreaterThan(0);

			await installExportBlobCapture({ page });
			await selectCliEngineAndEnableAudio({ page });
			await startExportAndWaitForCompletion({ consoleMessages, page });

			await expect
				.poll(
					async () => {
						return await page.evaluate(() => {
							type CaptureWindow = Window & {
								__qcutCapturedExportBlob?: Blob | null;
							};
							const globalWindow = window as CaptureWindow;
							const blob = globalWindow.__qcutCapturedExportBlob;
							return blob ? blob.size : 0;
						});
					},
					{ timeout: 20_000 }
				)
				.toBeGreaterThan(0);

			const streamValidation = await validateCapturedExportHasAudioAndVideo({
				page,
			});

			if (!streamValidation.ok) {
				throw new Error(streamValidation.error);
			}

			expect(streamValidation.videoBlobSize).toBeGreaterThan(0);
			expect(streamValidation.outputPath.length).toBeGreaterThan(0);
			expect(streamValidation.audioExtractionFileSize).toBeGreaterThan(0);

			// Verify audio files were prepared — actual log is "[CLI] Prepared N audio files for export"
			const audioFilesLog = consoleMessages.find((message) =>
				message.includes("audio files for export")
			);
			expect(audioFilesLog).toBeTruthy();

			if (audioFilesLog) {
				const audioFilesMatch = audioFilesLog.match(/(\d+)\s+audio files/i);
				expect(audioFilesMatch).toBeTruthy();
				if (audioFilesMatch) {
					const audioFilesCount = Number.parseInt(audioFilesMatch[1], 10);
					expect(audioFilesCount).toBeGreaterThan(0);
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Audio + video simultaneous export regression test failed: ${message}`
			);
		}
	});
});
