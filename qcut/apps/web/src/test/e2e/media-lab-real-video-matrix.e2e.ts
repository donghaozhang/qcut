import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { type ElectronApplication, _electron as electron } from "playwright";
import {
	createTestProject,
	expect,
	stubExportSaveDialog,
	test as qcutTest,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import { ensurePanelTabActive } from "./helpers/e2e-panel-helpers";
import { forceTerminateElectronApp } from "./helpers/sticker-lab-lifecycle-harness";

const challengeSourcePath = process.env.QCUT_MEDIA_LAB_CHALLENGE_VIDEO_PATH;
const cleanSourcePath = process.env.QCUT_MEDIA_LAB_CLEAN_VIDEO_PATH;
const requestedPixelCase = process.env.QCUT_MEDIA_LAB_PIXEL_CASE;
const evidenceDirectory = path.resolve(
	process.env.QCUT_MEDIA_LAB_MATRIX_EVIDENCE_DIRECTORY ??
		"docs/task/jianying-video-basic-panel-reference/evidence/real-video-matrix"
);

interface CliEnvelope {
	status?: string;
	command_id?: string;
	duration_ms?: number;
	data?: unknown;
	jobId?: string;
}

interface ElementEnhancements {
	stabilization: number;
	denoise: number;
	clarity: number;
	upscale: 1 | 2 | 4;
	relight: number;
	beauty: number;
	labDeflicker: number;
	labOpticalFlowMotionBlur: number;
	labEyeCorrection: number;
	labLocalSuperResolution: 0 | 2 | 4;
}

interface HarnessMask {
	type: string;
	tracking?: {
		status?: string;
		progress?: number;
		source?: string;
	};
	keyframes?: Record<string, Array<{ frame: number; value: number }>>;
}

interface HarnessElement {
	id: string;
	type: string;
	startTime: number;
	enhancements?: Partial<ElementEnhancements>;
	frameInterpolation?: string;
	keyframes?: Record<string, Array<{ frame: number; value: number }>>;
	masks?: HarnessMask[];
}

interface HarnessTrack {
	id: string;
	type: string;
	isMain?: boolean;
	elements: HarnessElement[];
}

interface HarnessWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
	__timelineStore: {
		getState: () => {
			tracks: HarnessTrack[];
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

interface TimelineClip {
	elementId: string;
	trackId: string;
}

interface ElementSnapshot {
	enhancements: Partial<ElementEnhancements> | null;
	frameInterpolation: string;
	keyframes: Record<string, Array<{ frame: number; value: number }>>;
	tracking: {
		keyframeCount: number;
		progress: number;
		source: string | null;
		status: string | null;
	} | null;
}

const DEFAULT_ENHANCEMENTS: ElementEnhancements = {
	stabilization: 0,
	denoise: 0,
	clarity: 0,
	upscale: 1,
	relight: 0,
	beauty: 0,
	labDeflicker: 0,
	labOpticalFlowMotionBlur: 0,
	labEyeCorrection: 0,
	labLocalSuperResolution: 0,
};

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
			path.join(tmpdir(), "qcut-media-lab-real-video-matrix-")
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
		try {
			await use(electronApp);
		} finally {
			await forceTerminateElectronApp({ electronApp });
			await rm(userDataDirectory, { force: true, recursive: true });
		}
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

function probeVideoOutput({
	filePath,
}: {
	filePath: string;
}): Promise<{ durationSeconds: number; frameCount: number }> {
	return new Promise((resolve, reject) => {
		execFile(
			"ffprobe",
			[
				"-v",
				"error",
				"-count_frames",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=nb_read_frames:format=duration",
				"-of",
				"json",
				filePath,
			],
			{ timeout: 30_000 },
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(`ffprobe failed: ${stderr || stdout || error.message}`)
					);
					return;
				}
				const parsed = JSON.parse(stdout) as {
					format?: { duration?: string };
					streams?: Array<{ nb_read_frames?: string }>;
				};
				const durationSeconds = Number(parsed.format?.duration);
				const frameCount = Number(parsed.streams?.[0]?.nb_read_frames);
				if (
					!Number.isFinite(durationSeconds) ||
					!Number.isInteger(frameCount)
				) {
					reject(new Error(`ffprobe returned incomplete output: ${stdout}`));
					return;
				}
				resolve({ durationSeconds, frameCount });
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
		const stores = window as unknown as HarnessWindow;
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
			duration: media.duration ?? 3,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!elementId) throw new Error("Failed to add the real-person video");
		timeline.setSelectedElements([{ trackId: track.id, elementId }]);
		return { elementId, trackId: track.id };
	});
}

async function readElementSnapshot({
	page,
	clip,
}: {
	page: Page;
	clip: TimelineClip;
}): Promise<ElementSnapshot> {
	return page.evaluate(({ trackId, elementId }) => {
		const timeline = (
			window as unknown as HarnessWindow
		).__timelineStore.getState();
		const element = timeline.tracks
			.find((track) => track.id === trackId)
			?.elements.find((candidate) => candidate.id === elementId);
		if (!element) throw new Error("Could not read the selected media element");
		const trackingMask = element.masks?.find(
			(mask) => mask.type === "person" && mask.tracking?.status === "ready"
		);
		const trackingFrames = new Set(
			Object.values(trackingMask?.keyframes ?? {}).flatMap((keyframes) =>
				keyframes.map((keyframe) => keyframe.frame)
			)
		);
		return {
			enhancements: element.enhancements ?? null,
			frameInterpolation: element.frameInterpolation ?? "none",
			keyframes: element.keyframes ?? {},
			tracking: trackingMask
				? {
						keyframeCount: trackingFrames.size,
						progress: trackingMask.tracking?.progress ?? 0,
						source: trackingMask.tracking?.source ?? null,
						status: trackingMask.tracking?.status ?? null,
					}
				: null,
		};
	}, clip);
}

async function seekInsideClip({ page }: { page: Page }): Promise<void> {
	await page.evaluate(() => {
		const stores = window as unknown as HarnessWindow;
		const element = stores.__timelineStore
			.getState()
			.tracks.flatMap((track) => track.elements)
			.find((candidate) => candidate.type === "media");
		if (!element) throw new Error("Expected a media element before seeking");
		stores.__playbackStore.getState().seek(element.startTime + 1);
	});
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
	const previewPanel = page.getByTestId("preview-panel");
	await expect(
		previewPanel.getByText("No elements at current time")
	).toHaveCount(0);
	const canvas = page.getByTestId("color-preview-canvas");
	if ((await canvas.count()) > 0) {
		await expect(canvas).toBeVisible({ timeout: 120_000 });
		await expect
			.poll(() => visiblePreviewSamples({ page }), {
				timeout: 120_000,
				intervals: [100, 250, 500, 1_000],
			})
			.toBeGreaterThan(40);
		return;
	}
	const video = previewPanel.locator("video").first();
	await expect(video).toBeVisible({ timeout: 120_000 });
	await expect
		.poll(
			() => video.evaluate((node) => (node as HTMLVideoElement).readyState),
			{
				timeout: 120_000,
			}
		)
		.toBeGreaterThanOrEqual(2);
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

async function exportThroughCli({
	apiPort,
	outputPath,
	projectId,
}: {
	apiPort: string;
	outputPath: string;
	projectId: string;
}) {
	await rm(outputPath, { force: true });
	const result = await runQCutCLI({
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
			outputPath,
			"--poll",
		],
	});
	expect(result.envelopes.at(-1)?.status).toBe("ok");
	const file = await waitForExportFile({ filePath: outputPath });
	const probe = await probeVideoOutput({ filePath: outputPath });
	expect(probe.frameCount).toBe(90);
	expect(probe.durationSeconds).toBeCloseTo(3, 6);
	const sha256 = createHash("sha256")
		.update(await readFile(outputPath))
		.digest("hex");
	return { bytes: file.size, envelopes: result.envelopes, probe, sha256 };
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
	await rm(outputPath, { force: true });
	await stubExportSaveDialog({ electronApp, outputPath });
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.getByTestId("export-start-button").click();
	const file = await waitForExportFile({ filePath: outputPath });
	return { bytes: file.size };
}

async function restorePropertiesPanel({ page }: { page: Page }): Promise<void> {
	const exportDialog = page.getByTestId("export-dialog");
	if (await exportDialog.isVisible()) {
		await exportDialog
			.getByRole("button", { name: "Close export dialog" })
			.click();
		await expect(exportDialog).toHaveCount(0);
	}
	await page.getByTestId("timeline-element").first().click();
	await expect(page.getByTestId("media-properties")).toBeVisible();
}

async function updateProjectSettings({
	apiPort,
	projectId,
}: {
	apiPort: string;
	projectId: string;
}): Promise<void> {
	const result = await runQCutCLI({
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
	expect(result.envelopes.at(-1)?.status).toBe("ok");
}

async function patchElement({
	apiPort,
	clip,
	projectId,
	updates,
}: {
	apiPort: string;
	clip: TimelineClip;
	projectId: string;
	updates: Record<string, unknown>;
}): Promise<CliEnvelope[]> {
	const result = await runQCutCLI({
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
			JSON.stringify(updates),
			"--force",
		],
	});
	expect(result.envelopes.at(-1)?.status).toBe("ok");
	return result.envelopes;
}

async function readTimelineThroughCli({
	apiPort,
	projectId,
}: {
	apiPort: string;
	projectId: string;
}): Promise<CliEnvelope[]> {
	const result = await runQCutCLI({
		apiPort,
		args: [
			"editor:timeline:export",
			"--port",
			apiPort,
			"--project-id",
			projectId,
		],
	});
	expect(result.envelopes.at(-1)?.status).toBe("ok");
	return result.envelopes;
}

async function resetPixelFeatures({
	apiPort,
	clip,
	projectId,
}: {
	apiPort: string;
	clip: TimelineClip;
	projectId: string;
}): Promise<void> {
	await patchElement({
		apiPort,
		clip,
		projectId,
		updates: {
			enhancements: DEFAULT_ENHANCEMENTS,
			frameInterpolation: "none",
		},
	});
}

async function setNumericInputWithPointer({
	page,
	input,
	value,
}: {
	page: Page;
	input: Locator;
	value: string;
}): Promise<void> {
	await input.scrollIntoViewIfNeeded();
	const box = await input.boundingBox();
	if (!box) throw new Error("Numeric input is not visible");
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.keyboard.press("Meta+A");
	await page.keyboard.type(value);
	await page.keyboard.press("Tab");
	await expect(input).toHaveValue(value);
}

async function clickWithPointer({
	page,
	target,
}: {
	page: Page;
	target: Locator;
}): Promise<void> {
	await target.scrollIntoViewIfNeeded();
	const box = await target.boundingBox();
	if (!box) throw new Error("Pointer target is not visible");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.up();
}

async function openPropertyGroup({
	properties,
	title,
}: {
	properties: Locator;
	title: string;
}): Promise<void> {
	const trigger = properties.getByRole("button", { name: title, exact: true });
	if ((await trigger.getAttribute("data-state")) !== "open") {
		await trigger.click();
	}
}

async function startRealPersonTracking({
	page,
	sourcePath,
}: {
	page: Page;
	sourcePath: string;
}): Promise<ElementSnapshot["tracking"]> {
	await ensurePanelTabActive(page, "edit", "segmentation", "AI Assist");
	const panel = page.getByTestId("media-panel");
	await panel.getByRole("tab", { name: /^(Video|视频)$/ }).click();
	const personCutoutTab = panel.getByRole("tab", {
		name: /^(Local Person|Person Cutout|人物抠像)$/,
	});
	await personCutoutTab.click();
	await expect(personCutoutTab).toHaveAttribute("data-state", "active");
	await panel
		.locator('input[type="file"][accept="video/*"]')
		.setInputFiles(sourcePath);
	const startButton = panel.getByTestId("person-cutout-export");
	await expect(startButton).toHaveText(/开始并应用|Start/);
	await startButton.click();
	await expect(panel.getByTestId("person-cutout-result")).toBeVisible({
		timeout: 180_000,
	});
	return page.evaluate(() => {
		const element = (window as unknown as HarnessWindow).__timelineStore
			.getState()
			.tracks.flatMap((track) => track.elements)
			.find((candidate) => candidate.type === "media");
		const mask = element?.masks?.find(
			(candidate) => candidate.type === "person"
		);
		if (!mask) throw new Error("Local person tracking did not attach a mask");
		const frames = new Set(
			Object.values(mask.keyframes ?? {}).flatMap((keyframes) =>
				keyframes.map((keyframe) => keyframe.frame)
			)
		);
		return {
			keyframeCount: frames.size,
			progress: mask.tracking?.progress ?? 0,
			source: mask.tracking?.source ?? null,
			status: mask.tracking?.status ?? null,
		};
	});
}

test.describe("Local video lab real-video matrix", () => {
	test.skip(
		!challengeSourcePath || !existsSync(challengeSourcePath),
		"Set QCUT_MEDIA_LAB_CHALLENGE_VIDEO_PATH to the real-person challenge video"
	);

	test("exports every pixel feature through CLI and exercises the visible UI", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(1_800_000);
		if (!challengeSourcePath) throw new Error("Missing challenge video path");
		await mkdir(evidenceDirectory, { recursive: true });
		await createTestProject(page, "Media Lab Real Video Pixel Matrix");
		const projectId = projectIdFromPage({ page });
		const apiPort = await electronApp.evaluate(
			() => process.env.QCUT_API_PORT ?? "8765"
		);
		await updateProjectSettings({ apiPort, projectId });
		await uploadTestMedia(page, challengeSourcePath);
		const clip = await addImportedVideoToTimeline({ page });
		await page.getByTestId("timeline-element").first().click();
		await seekInsideClip({ page });
		await waitForVisiblePreview({ page });

		const results: Record<string, unknown> = {
			apiPort,
			challengeSourcePath,
			projectId,
		};
		await resetPixelFeatures({ apiPort, clip, projectId });
		const baseline = await exportThroughCli({
			apiPort,
			outputPath: path.join(evidenceDirectory, "10-qcut-baseline.mp4"),
			projectId,
		});
		results.baseline = baseline;

		const cases = [
			{
				id: "stabilization",
				updates: {
					enhancements: { ...DEFAULT_ENHANCEMENTS, stabilization: 70 },
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.stabilization).toBe(70),
			},
			{
				id: "denoise",
				updates: {
					enhancements: { ...DEFAULT_ENHANCEMENTS, denoise: 70 },
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.denoise).toBe(70),
			},
			{
				id: "deflicker",
				updates: {
					enhancements: { ...DEFAULT_ENHANCEMENTS, labDeflicker: 70 },
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.labDeflicker).toBe(70),
			},
			{
				id: "motion-blur",
				updates: {
					enhancements: {
						...DEFAULT_ENHANCEMENTS,
						labOpticalFlowMotionBlur: 50,
					},
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.labOpticalFlowMotionBlur).toBe(50),
			},
			{
				id: "eye-detail",
				updates: {
					enhancements: { ...DEFAULT_ENHANCEMENTS, labEyeCorrection: 60 },
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.labEyeCorrection).toBe(60),
			},
			{
				id: "local-super-resolution",
				updates: {
					enhancements: {
						...DEFAULT_ENHANCEMENTS,
						labLocalSuperResolution: 2,
					},
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.enhancements?.labLocalSuperResolution).toBe(2),
			},
			{
				id: "frame-interpolation",
				updates: {
					enhancements: DEFAULT_ENHANCEMENTS,
					frameInterpolation: "motion-compensated",
				},
				verify: (snapshot: ElementSnapshot) =>
					expect(snapshot.frameInterpolation).toBe("motion-compensated"),
			},
		] as const;

		const selectedCases = requestedPixelCase
			? cases.filter((featureCase) => featureCase.id === requestedPixelCase)
			: cases;
		expect(selectedCases.length).toBeGreaterThan(0);
		for (const [index, featureCase] of selectedCases.entries()) {
			await resetPixelFeatures({ apiPort, clip, projectId });
			const patch = await patchElement({
				apiPort,
				clip,
				projectId,
				updates: featureCase.updates,
			});
			const snapshot = await readElementSnapshot({ page, clip });
			featureCase.verify(snapshot);
			const timelineReadback = await readTimelineThroughCli({
				apiPort,
				projectId,
			});
			await writeFile(
				path.join(
					evidenceDirectory,
					`qcut-${featureCase.id}-timeline-readback.json`
				),
				`${JSON.stringify(timelineReadback, null, 2)}\n`
			);
			await seekInsideClip({ page });
			await waitForVisiblePreview({ page });
			await page.screenshot({
				path: path.join(
					evidenceDirectory,
					`${String(index + 11).padStart(2, "0")}-qcut-${featureCase.id}-ui.png`
				),
				animations: "disabled",
			});
			const exported = await exportThroughCli({
				apiPort,
				outputPath: path.join(evidenceDirectory, `qcut-${featureCase.id}.mp4`),
				projectId,
			});
			await writeFile(
				path.join(evidenceDirectory, `qcut-${featureCase.id}-export-job.json`),
				`${JSON.stringify(exported, null, 2)}\n`
			);
			expect(exported.sha256).not.toBe(baseline.sha256);
			await restorePropertiesPanel({ page });
			results[featureCase.id] = {
				exported,
				patch,
				snapshot,
				timelineReadback,
			};
		}

		await resetPixelFeatures({ apiPort, clip, projectId });
		const properties = page.getByTestId("media-properties");
		await openPropertyGroup({ properties, title: "视频防抖" });
		await setNumericInputWithPointer({
			page,
			input: properties.getByLabel("本地防抖数值"),
			value: "45",
		});
		await openPropertyGroup({ properties, title: "画质增强" });
		await setNumericInputWithPointer({
			page,
			input: properties.getByLabel("视频降噪数值"),
			value: "45",
		});
		const lab = page.getByTestId("media-lab-properties");
		await setNumericInputWithPointer({
			page,
			input: lab.getByLabel("实验室防闪烁数值"),
			value: "45",
		});
		await setNumericInputWithPointer({
			page,
			input: lab.getByLabel("实验室光流运动模糊数值"),
			value: "35",
		});
		await setNumericInputWithPointer({
			page,
			input: lab.getByLabel("实验室眼神修正数值"),
			value: "40",
		});
		await clickWithPointer({
			page,
			target: lab.getByLabel("实验室本地超分"),
		});
		await page.getByRole("option", { name: "2x", exact: true }).click();
		await properties
			.getByTestId("media-properties-primary-tabs")
			.getByRole("tab", { name: "变速", exact: true })
			.click();
		const speedPanel = properties.getByTestId("media-speed-properties");
		await speedPanel.getByTestId("speed-mode-curve").click();
		await clickWithPointer({
			page,
			target: speedPanel.getByTestId("speed-frame-interpolation"),
		});
		await expect
			.poll(
				async () =>
					(await readElementSnapshot({ page, clip })).frameInterpolation
			)
			.toBe("motion-compensated");
		await seekInsideClip({ page });
		await waitForVisiblePreview({ page });
		await page.screenshot({
			path: path.join(evidenceDirectory, "20-qcut-ui-combined-features.png"),
			animations: "disabled",
		});
		results.uiCombined = {
			exported: await exportThroughUi({
				electronApp,
				page,
				outputPath: path.join(evidenceDirectory, "qcut-ui-combined.mp4"),
			}),
			snapshot: await readElementSnapshot({ page, clip }),
		};
		await writeFile(
			path.join(evidenceDirectory, "qcut-pixel-matrix-evidence.json"),
			`${JSON.stringify(results, null, 2)}\n`,
			"utf8"
		);
	});

	test.skip(
		!cleanSourcePath || !existsSync(cleanSourcePath),
		"Set QCUT_MEDIA_LAB_CLEAN_VIDEO_PATH to the clean real-person video"
	);

	test("runs real local person tracking before exporting all smart tools", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(1_200_000);
		if (!cleanSourcePath)
			throw new Error("Missing clean real-person video path");
		await mkdir(evidenceDirectory, { recursive: true });
		await createTestProject(page, "Media Lab Real Tracking Matrix");
		const projectId = projectIdFromPage({ page });
		const apiPort = await electronApp.evaluate(
			() => process.env.QCUT_API_PORT ?? "8765"
		);
		await updateProjectSettings({ apiPort, projectId });
		await uploadTestMedia(page, cleanSourcePath);
		const clip = await addImportedVideoToTimeline({ page });
		await page.getByTestId("timeline-element").first().click();
		await seekInsideClip({ page });
		const baseline = await exportThroughCli({
			apiPort,
			outputPath: path.join(evidenceDirectory, "qcut-smart-baseline.mp4"),
			projectId,
		});
		const tracking = await startRealPersonTracking({
			page,
			sourcePath: cleanSourcePath,
		});
		expect(tracking).toMatchObject({
			progress: 100,
			source: "mediapipe",
			status: "ready",
		});
		expect(tracking?.keyframeCount).toBeGreaterThan(1);

		await page.getByTestId("timeline-element").first().click();
		await seekInsideClip({ page });
		const lab = page.getByTestId("media-lab-properties");
		await expect(lab).toBeVisible();
		const smartCases = [
			{ id: "smart-motion", label: "实验室智能运镜", expectsScale: true },
			{ id: "smart-crop", label: "实验室智能裁剪", expectsScale: true },
			{ id: "camera-tracking", label: "实验室镜头追踪", expectsScale: false },
		] as const;
		const results: Record<string, unknown> = {
			apiPort,
			baseline,
			cleanSourcePath,
			projectId,
			tracking,
		};

		for (const [index, smartCase] of smartCases.entries()) {
			const button = lab.getByRole("button", {
				name: smartCase.label,
				exact: true,
			});
			await expect(button).toBeEnabled();
			await clickWithPointer({ page, target: button });
			const snapshot = await readElementSnapshot({ page, clip });
			expect(snapshot.keyframes.x?.length ?? 0).toBeGreaterThan(1);
			expect(snapshot.keyframes.y?.length ?? 0).toBeGreaterThan(1);
			if (smartCase.expectsScale) {
				expect(snapshot.keyframes.scaleX?.length ?? 0).toBeGreaterThan(1);
				expect(snapshot.keyframes.scaleY?.length ?? 0).toBeGreaterThan(1);
			}
			await seekInsideClip({ page });
			await waitForVisiblePreview({ page });
			await page.screenshot({
				path: path.join(
					evidenceDirectory,
					`${21 + index}-qcut-${smartCase.id}-real-track.png`
				),
				animations: "disabled",
			});
			const exported = await exportThroughCli({
				apiPort,
				outputPath: path.join(evidenceDirectory, `qcut-${smartCase.id}.mp4`),
				projectId,
			});
			results[smartCase.id] = { exported, snapshot };
			await page.keyboard.press("Meta+z");
			await expect
				.poll(async () => {
					const reverted = await readElementSnapshot({ page, clip });
					return Object.values(reverted.keyframes).flat().length;
				})
				.toBe(0);
		}
		await writeFile(
			path.join(evidenceDirectory, "qcut-smart-tools-evidence.json"),
			`${JSON.stringify(results, null, 2)}\n`,
			"utf8"
		);
	});
});
