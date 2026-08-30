import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { type ElectronApplication, _electron as electron } from "playwright";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test as qcutTest,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const sourcePath = process.env.QCUT_MEDIA_LAB_REAL_VIDEO_PATH;
const evidenceDirectory = path.resolve(
	process.env.QCUT_MEDIA_LAB_EVIDENCE_DIRECTORY ??
		"docs/task/jianying-video-basic-panel-reference/evidence/real-person"
);
const cliExportPath = path.join(
	evidenceDirectory,
	"qcut-cli-eye-detail-60.mp4"
);
const uiExportPath = path.join(evidenceDirectory, "qcut-ui-eye-detail-60.mp4");

interface CliEnvelope {
	status?: string;
	command_id?: string;
	duration_ms?: number;
	data?: unknown;
	jobId?: string;
}

interface TimelineHarnessWindow extends Window {
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
					enhancements?: {
						labEyeCorrection?: number;
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

async function findAvailablePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Could not allocate a QCut E2E API port");
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return address.port;
}

const test = qcutTest.extend({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	electronApp: async ({}, use) => {
		const apiPort = await findAvailablePort();
		const userDataDirectory = await mkdtemp(
			path.join(tmpdir(), "qcut-media-lab-real-person-")
		);
		const electronApp = await electron.launch({
			args: ["dist/electron/main.js", `--user-data-dir=${userDataDirectory}`],
			env: {
				...process.env,
				ELECTRON_DISABLE_GPU: "1",
				NODE_ENV: "test",
				QCUT_API_PORT: String(apiPort),
			},
		});
		await use(electronApp);
		await electronApp.close();
		await rm(userDataDirectory, { force: true, recursive: true });
	},
});

function parseCliEnvelopes({ stdout }: { stdout: string }): CliEnvelope[] {
	const documents = stdout
		.trim()
		.split(/(?=^\{)/m)
		.map((document) => document.trim())
		.filter(Boolean);
	if (documents.length === 0) {
		throw new Error(`QCut CLI produced no JSON: ${stdout}`);
	}
	return documents.map((document) => JSON.parse(document) as CliEnvelope);
}

function runQCutCLI({
	apiPort,
	args,
	timeout = 120_000,
}: {
	apiPort: string;
	args: string[];
	timeout?: number;
}): Promise<{ envelopes: CliEnvelope[]; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(
			"bun",
			["--silent", "run", "qcut", "--", ...args, "--json"],
			{
				cwd: path.resolve("."),
				env: { ...process.env, QCUT_API_PORT: apiPort },
				maxBuffer: 8 * 1024 * 1024,
				timeout,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(`QCut CLI failed: ${stderr || stdout || error.message}`)
					);
					return;
				}
				resolve({ envelopes: parseCliEnvelopes({ stdout }), stderr });
			}
		);
	});
}

function measureMinimumFrameSsim({
	candidatePath,
	referencePath,
}: {
	candidatePath: string;
	referencePath: string;
}): Promise<{ frameCount: number; minimumSsim: number }> {
	return new Promise((resolve, reject) => {
		execFile(
			"ffmpeg",
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-i",
				referencePath,
				"-i",
				candidatePath,
				"-filter_complex",
				"[0:v]fps=30,scale=360:640:flags=lanczos,setpts=PTS-STARTPTS[reference];[1:v]fps=30,scale=360:640:flags=lanczos,setpts=PTS-STARTPTS[candidate];[reference][candidate]ssim=stats_file=-",
				"-an",
				"-f",
				"null",
				"-",
			],
			{ maxBuffer: 8 * 1024 * 1024, timeout: 120_000 },
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(
							`Could not measure frame SSIM: ${stderr || stdout || error.message}`
						)
					);
					return;
				}
				const frameScores = Array.from(
					stdout.matchAll(/\bAll:([0-9.]+)/g),
					(match) => Number(match[1])
				);
				if (frameScores.length === 0 || frameScores.some(Number.isNaN)) {
					reject(
						new Error(`FFmpeg returned no valid frame SSIM data: ${stdout}`)
					);
					return;
				}
				resolve({
					frameCount: frameScores.length,
					minimumSsim: Math.min(...frameScores),
				});
			}
		);
	});
}

function projectIdFromPage({ page }: { page: Page }): string {
	const projectId = new URL(page.url()).hash.match(/^#\/editor\/([^/?]+)/)?.[1];
	if (!projectId) throw new Error("Could not resolve the E2E project id");
	return decodeURIComponent(projectId);
}

async function addImportedVideoToTimeline({ page }: { page: Page }) {
	return page.evaluate(() => {
		const stores = window as unknown as TimelineHarnessWindow;
		const media = stores.__mediaStore.getState().mediaItems[0];
		const timeline = stores.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		if (!media || !track)
			throw new Error("Expected imported real-person video");
		const elementId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: media.id,
			name: media.name,
			duration: media.duration ?? 2,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!elementId) throw new Error("Failed to add the real-person video");
		timeline.setSelectedElements([{ trackId: track.id, elementId }]);
		return { elementId, trackId: track.id };
	});
}

async function readEyeDetailState({
	page,
	clip,
}: {
	page: Page;
	clip: { elementId: string; trackId: string };
}) {
	return page.evaluate(({ trackId, elementId }) => {
		const timeline = (
			window as unknown as TimelineHarnessWindow
		).__timelineStore.getState();
		return timeline.tracks
			.find((track) => track.id === trackId)
			?.elements.find((element) => element.id === elementId)?.enhancements
			?.labEyeCorrection;
	}, clip);
}

async function visiblePreviewSamples({
	page,
}: {
	page: Page;
}): Promise<number> {
	return page.getByTestId("color-preview-canvas").evaluate((canvasNode) => {
		const canvas = canvasNode as HTMLCanvasElement;
		const pixels = canvas
			.getContext("2d", { willReadFrequently: true })
			?.getImageData(0, 0, canvas.width, canvas.height).data;
		if (!pixels) return 0;
		const sampleStride = Math.max(4, Math.floor(pixels.length / 4_096 / 4) * 4);
		let visible = 0;
		for (let offset = 0; offset < pixels.length; offset += sampleStride) {
			if (
				pixels[offset + 3] > 16 &&
				Math.max(
					pixels[offset] ?? 0,
					pixels[offset + 1] ?? 0,
					pixels[offset + 2] ?? 0
				) > 16
			) {
				visible += 1;
			}
		}
		return visible;
	});
}

async function waitForVisiblePreview({ page }: { page: Page }): Promise<void> {
	await expect
		.poll(() => visiblePreviewSamples({ page }), {
			timeout: 120_000,
			intervals: [100, 250, 500, 1_000],
		})
		.toBeGreaterThan(40);
}

async function waitForExportFile({ filePath }: { filePath: string }) {
	await expect
		.poll(
			async () => {
				try {
					return (await stat(filePath)).size;
				} catch {
					return 0;
				}
			},
			{ timeout: 300_000, intervals: [500, 1_000, 2_000] }
		)
		.toBeGreaterThan(1_000);
	return stat(filePath);
}

async function exportThroughUi({
	electronApp,
	page,
	outputPath,
}: {
	electronApp: ElectronApplication;
	page: Page;
	outputPath: string;
}) {
	await stubExportSaveDialog({ electronApp, outputPath });
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.getByTestId("export-start-button").click();
	return waitForExportFile({ filePath: outputPath });
}

test.describe("Local video lab real-person CLI and UI", () => {
	test.skip(
		!sourcePath || !existsSync(sourcePath),
		"Set QCUT_MEDIA_LAB_REAL_VIDEO_PATH to a local real-person video"
	);

	test("exports the same eye-detail strength through CLI and visible UI", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(600_000);
		if (!sourcePath) throw new Error("Missing real-person video path");
		await mkdir(evidenceDirectory, { recursive: true });
		await Promise.all([
			rm(cliExportPath, { force: true }),
			rm(uiExportPath, { force: true }),
		]);
		await createTestProject(page, "Media Lab Real Person E2E");
		const projectId = projectIdFromPage({ page });
		const apiPort = await electronApp.evaluate(
			() => process.env.QCUT_API_PORT ?? "8765"
		);
		const projectSettings = await runQCutCLI({
			apiPort,
			args: [
				"editor:project:update-settings",
				"--port",
				apiPort,
				"--project-id",
				projectId,
				"--data",
				JSON.stringify({ width: 360, height: 640, fps: 30 }),
			],
		});
		expect(projectSettings.envelopes.at(-1)?.status).toBe("ok");

		await uploadTestMedia(page, sourcePath);
		const clip = await addImportedVideoToTimeline({ page });
		const timelineClip = page.getByTestId("timeline-element").first();
		await expect(timelineClip).toBeVisible();
		await timelineClip.click();
		await page.evaluate(() => {
			const playback = (
				window as unknown as {
					__playbackStore: { getState: () => { seek: (time: number) => void } };
				}
			).__playbackStore.getState();
			playback.seek(1);
		});

		const lab = page.getByTestId("media-lab-properties");
		await expect(lab).toBeVisible();
		await lab.scrollIntoViewIfNeeded();
		const eyeInput = lab.getByLabel("实验室眼神修正数值");

		const cliPatch = await runQCutCLI({
			apiPort,
			args: [
				"editor:element:patch",
				"--port",
				apiPort,
				"--project-id",
				projectId,
				"--element-id",
				clip.elementId,
				"--set",
				JSON.stringify({
					enhancements: {
						labDeflicker: 0,
						labOpticalFlowMotionBlur: 0,
						labEyeCorrection: 60,
						labLocalSuperResolution: 0,
					},
				}),
				"--force",
			],
		});
		expect(cliPatch.envelopes.at(-1)?.status).toBe("ok");
		await expect(eyeInput).toHaveValue("60");
		expect(await readEyeDetailState({ page, clip })).toBe(60);
		await expect(page.getByTestId("color-preview-canvas")).toBeVisible({
			timeout: 120_000,
		});
		await waitForVisiblePreview({ page });
		await page.screenshot({
			path: path.join(evidenceDirectory, "01-qcut-cli-patch-visible-in-ui.png"),
			animations: "disabled",
		});

		const cliExport = await runQCutCLI({
			apiPort,
			timeout: 360_000,
			args: [
				"editor:export:start",
				"--port",
				apiPort,
				"--project-id",
				projectId,
				"--preset",
				"tiktok",
				"--format",
				"mp4",
				"--fps",
				"30",
				"--output",
				cliExportPath,
				"--poll",
			],
		});
		expect(cliExport.envelopes.at(-1)?.status).toBe("ok");
		const cliFile = await waitForExportFile({ filePath: cliExportPath });

		await runQCutCLI({
			apiPort,
			args: [
				"editor:element:patch",
				"--port",
				apiPort,
				"--project-id",
				projectId,
				"--element-id",
				clip.elementId,
				"--set",
				JSON.stringify({
					enhancements: {
						labDeflicker: 0,
						labOpticalFlowMotionBlur: 0,
						labEyeCorrection: 0,
						labLocalSuperResolution: 0,
					},
				}),
				"--force",
			],
		});
		await expect(eyeInput).toHaveValue("0");

		const inputBox = await eyeInput.boundingBox();
		if (!inputBox) throw new Error("Eye-detail input is not visible");
		await page.mouse.click(
			inputBox.x + inputBox.width / 2,
			inputBox.y + inputBox.height / 2
		);
		await page.keyboard.press("Meta+A");
		await page.keyboard.type("60");
		await page.keyboard.press("Tab");
		await expect(eyeInput).toHaveValue("60");
		expect(await readEyeDetailState({ page, clip })).toBe(60);
		await expect(page.getByTestId("color-preview-canvas")).toBeVisible({
			timeout: 120_000,
		});
		await waitForVisiblePreview({ page });
		await page.screenshot({
			path: path.join(evidenceDirectory, "02-qcut-ui-pointer-eye-detail.png"),
			animations: "disabled",
		});

		const uiFile = await exportThroughUi({
			electronApp,
			page,
			outputPath: uiExportPath,
		});
		const [cliFrameQuality, uiFrameQuality] = await Promise.all([
			measureMinimumFrameSsim({
				candidatePath: cliExportPath,
				referencePath: sourcePath,
			}),
			measureMinimumFrameSsim({
				candidatePath: uiExportPath,
				referencePath: sourcePath,
			}),
		]);
		expect(cliFrameQuality.frameCount).toBe(60);
		expect(uiFrameQuality.frameCount).toBe(60);
		expect(cliFrameQuality.minimumSsim).toBeGreaterThan(0.95);
		expect(uiFrameQuality.minimumSsim).toBeGreaterThan(0.95);
		const finalState = await readEyeDetailState({ page, clip });
		await writeFile(
			path.join(evidenceDirectory, "qcut-cli-ui-evidence.json"),
			`${JSON.stringify(
				{
					apiPort,
					cliExport: cliExport.envelopes,
					cliExportBytes: cliFile.size,
					cliFrameQuality,
					cliPatch: cliPatch.envelopes,
					finalState,
					projectId,
					projectSettings: projectSettings.envelopes,
					sourcePath,
					uiExportBytes: uiFile.size,
					uiFrameQuality,
				},
				null,
				2
			)}\n`,
			"utf8"
		);
	});
});
