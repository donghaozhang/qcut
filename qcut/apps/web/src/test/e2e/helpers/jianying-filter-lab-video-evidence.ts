import { execFile } from "node:child_process";
import { rm, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";

const execFileAsync = promisify(execFile);

type TimelineElement = {
	duration?: number;
	id: string;
	startTime?: number;
	type: string;
};

type TimelineState = {
	tracks: Array<{ elements: TimelineElement[]; id: string }>;
	updateAdjustmentElement: (
		trackId: string,
		elementId: string,
		updates: { duration: number },
		recordHistory: boolean
	) => void;
	updateElementDuration: (
		trackId: string,
		elementId: string,
		duration: number,
		recordHistory: boolean
	) => void;
	updateMediaElement: (
		trackId: string,
		elementId: string,
		updates: { duration: number },
		recordHistory: boolean
	) => void;
};

type FfprobeOutput = {
	streams?: Array<{
		avg_frame_rate?: string;
		codec_name?: string;
		duration?: string;
		height?: number;
		nb_read_frames?: string;
		width?: number;
	}>;
};

export type MovingVideoEvidence = {
	codecName: string;
	durationSeconds: number;
	frameHashes: string[];
	frameRate: number;
	frames: number;
	height: number;
	sizeBytes: number;
	width: number;
};

function parseFrameRate({ value }: { value: string | undefined }) {
	if (!value) return 0;
	const [numerator = "0", denominator = "1"] = value.split("/");
	const denominatorValue = Number(denominator);
	return denominatorValue === 0 ? 0 : Number(numerator) / denominatorValue;
}

async function readFrameHashes({ filePath }: { filePath: string }) {
	const { stdout } = await execFileAsync(getFFmpegPath(), [
		"-v",
		"error",
		"-i",
		filePath,
		"-vf",
		"select=eq(n\\,0)+eq(n\\,15)+eq(n\\,29)",
		"-vsync",
		"0",
		"-f",
		"framemd5",
		"-",
	]);
	return stdout
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.map((line) => line.split(",").at(-1)?.trim() ?? "")
		.filter(Boolean);
}

async function inspectMovingVideo({
	filePath,
}: {
	filePath: string;
}): Promise<MovingVideoEvidence> {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-count_frames",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=codec_name,width,height,avg_frame_rate,duration,nb_read_frames",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as FfprobeOutput;
	const stream = probe.streams?.[0];
	if (!stream) throw new Error(`No video stream in ${filePath}`);
	return {
		codecName: stream.codec_name ?? "",
		durationSeconds: Number(stream.duration ?? 0),
		frameHashes: await readFrameHashes({ filePath }),
		frameRate: parseFrameRate({ value: stream.avg_frame_rate }),
		frames: Number(stream.nb_read_frames ?? 0),
		height: stream.height ?? 0,
		sizeBytes: (await stat(filePath)).size,
		width: stream.width ?? 0,
	};
}

export async function trimTimelineToOneSecond({ page }: { page: Page }) {
	await page.evaluate(() => {
		const state = (
			window as unknown as {
				__timelineStore: { getState: () => TimelineState };
			}
		).__timelineStore.getState();
		for (const track of state.tracks) {
			for (const element of track.elements) {
				if (element.type === "media") {
					state.updateMediaElement(
						track.id,
						element.id,
						{ duration: 1 },
						false
					);
					continue;
				}
				if (element.type === "adjustment") {
					state.updateAdjustmentElement(
						track.id,
						element.id,
						{ duration: 1 },
						false
					);
					continue;
				}
				state.updateElementDuration(track.id, element.id, 1, false);
			}
		}
	});
	await expect
		.poll(() =>
			page.evaluate(() => {
				const tracks = (
					window as unknown as {
						__timelineStore: { getState: () => TimelineState };
					}
				).__timelineStore.getState().tracks;
				return Math.max(
					0,
					...tracks.flatMap(({ elements }) =>
						elements.map(
							(element) => (element.startTime ?? 0) + (element.duration ?? 0)
						)
					)
				);
			})
		)
		.toBe(1);
}

export async function exportAndVerifyMovingVideo({
	electronApp,
	filePath,
	page,
}: {
	electronApp: ElectronApplication;
	filePath: string;
	page: Page;
}) {
	await rm(filePath, { force: true });
	await electronApp.evaluate(async ({ dialog }, selectedPath) => {
		dialog.showSaveDialog = async () => ({
			canceled: false,
			filePath: selectedPath,
		});
	}, filePath);
	await page.getByTestId("export-button").click();
	await expect(page.getByTestId("export-dialog")).toBeVisible();
	await page.getByTestId("export-quality-select").locator("button").click();
	await page.getByRole("radio", { name: /^(?:1280×720|720×1280)/ }).click();
	const includeAudio = page.getByRole("checkbox", {
		name: "Include audio in export",
	});
	if ((await includeAudio.count()) > 0 && (await includeAudio.isChecked())) {
		await includeAudio.click();
	}
	await page.getByTestId("export-start-button").click();
	await expect
		.poll(
			async () => {
				try {
					return (await stat(filePath)).size;
				} catch {
					return 0;
				}
			},
			{ timeout: 180_000, intervals: [500, 1_000, 2_000] }
		)
		.toBeGreaterThan(1_000);
	await expect(page.getByTestId("export-start-button")).toBeVisible({
		timeout: 180_000,
	});
	await page.getByRole("button", { name: "Close export dialog" }).click();

	const evidence = await inspectMovingVideo({ filePath });
	expect(evidence.codecName).toBe("h264");
	expect(Math.min(evidence.width, evidence.height)).toBe(720);
	expect(Math.max(evidence.width, evidence.height)).toBe(1280);
	expect(evidence.frameRate).toBeCloseTo(30, 2);
	expect(evidence.durationSeconds).toBeCloseTo(1, 1);
	expect(evidence.frames).toBe(30);
	expect(evidence.frameHashes).toHaveLength(3);
	expect(new Set(evidence.frameHashes).size).toBeGreaterThan(1);
	return evidence;
}
