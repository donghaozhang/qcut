import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createJianyingPortraitAdjustmentProvider } from "../jianying-portrait-adjustment-runtime/provider.js";
import type { PersonCutoutModelRoute } from "./mask-cache.js";

const execFileAsync = promisify(execFile);
const SAMPLE_POSITIONS = [0.15, 0.35, 0.6] as const;
export const JIANYING_FACE_SAMPLE_RATIO_THRESHOLD = 0.5;

export type PersonCutoutRoutingMode = PersonCutoutModelRoute | "auto";

export function resolvePersonCutoutRoutingMode({
	automaticRoutingEnabled,
	requestedRoute,
}: {
	automaticRoutingEnabled: boolean;
	requestedRoute?: string;
}): PersonCutoutRoutingMode {
	if (
		requestedRoute === "portrait-gru" ||
		requestedRoute === "video-object" ||
		requestedRoute === "saliency-script"
	) {
		return requestedRoute;
	}
	return automaticRoutingEnabled ? "auto" : "portrait-gru";
}

export function selectPersonCutoutRoute({
	facePositiveSampleCount,
	personPositiveSampleCount,
	personValidSampleCount,
	validSampleCount,
	videoObjectAvailable,
}: {
	facePositiveSampleCount: number;
	personPositiveSampleCount: number;
	personValidSampleCount: number;
	validSampleCount: number;
	videoObjectAvailable: boolean;
}): PersonCutoutModelRoute {
	if (!videoObjectAvailable || validSampleCount === 0) return "portrait-gru";
	const faceSampleRatio = facePositiveSampleCount / validSampleCount;
	if (faceSampleRatio >= JIANYING_FACE_SAMPLE_RATIO_THRESHOLD) {
		return "portrait-gru";
	}
	if (
		personValidSampleCount !== validSampleCount ||
		personPositiveSampleCount > 0
	) {
		return "portrait-gru";
	}
	return "video-object";
}

export async function detectPersonCutoutModelRoute({
	duration,
	ffmpegPath,
	frameRate,
	height,
	videoObjectAvailable,
	sourcePath,
	width,
}: {
	duration: number;
	ffmpegPath: string;
	frameRate: number;
	height: number;
	videoObjectAvailable: boolean;
	sourcePath: string;
	width: number;
}): Promise<PersonCutoutModelRoute> {
	if (!videoObjectAvailable) return "portrait-gru";
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-matting-route-")
	);
	const sampleTimes = SAMPLE_POSITIONS.map((position) =>
		Math.max(0, Math.min(duration - 1 / frameRate, duration * position))
	);
	const samplePaths = sampleTimes.map((_, index) =>
		path.join(directory, `sample-${index}.rgba`)
	);
	const provider = createJianyingPortraitAdjustmentProvider();
	try {
		await Promise.all(
			sampleTimes.map((timestamp, index) =>
				execFileAsync(
					ffmpegPath,
					[
						"-y",
						"-v",
						"error",
						"-ss",
						String(timestamp),
						"-i",
						sourcePath,
						"-frames:v",
						"1",
						"-pix_fmt",
						"rgba",
						"-f",
						"rawvideo",
						samplePaths[index],
					],
					{ maxBuffer: 4 * 1024 * 1024 }
				)
			)
		);
		let validSampleCount = 0;
		let facePositiveSampleCount = 0;
		const expectedBytes = width * height * 4;
		for (let index = 0; index < samplePaths.length; index += 1) {
			const rgba = new Uint8Array(await readFile(samplePaths[index]));
			if (rgba.byteLength !== expectedBytes) continue;
			validSampleCount += 1;
			const result = await provider.detect({
				frameNumber: Math.round(sampleTimes[index] * frameRate),
				height,
				personBindings: [],
				rgba,
				width,
			});
			if (result.faces.length === 0) continue;
			facePositiveSampleCount += 1;
			break;
		}
		return selectPersonCutoutRoute({
			facePositiveSampleCount,
			// Face absence is not proof that a frame has no person.
			personPositiveSampleCount: 0,
			personValidSampleCount: 0,
			validSampleCount,
			videoObjectAvailable,
		});
	} catch (error) {
		console.warn(
			"Person cutout model routing failed; keeping the portrait GRU route.",
			error
		);
		return "portrait-gru";
	} finally {
		await provider.clear();
		await rm(directory, { force: true, recursive: true });
	}
}
