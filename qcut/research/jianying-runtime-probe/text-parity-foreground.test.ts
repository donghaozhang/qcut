import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	compareTextForeground,
	compareTextForegroundAndGeometry,
} from "./text-parity-foreground";

const directories: string[] = [];

function writePpm({
	filePath,
	width,
	height,
	pixels,
}: {
	filePath: string;
	width: number;
	height: number;
	pixels: number[];
}) {
	writeFileSync(
		filePath,
		Buffer.concat([
			Buffer.from(`P6\n${width} ${height}\n255\n`),
			Buffer.from(pixels),
		])
	);
}

function frameWithWhitePixels({
	width,
	height,
	indices,
}: {
	width: number;
	height: number;
	indices: number[];
}): number[] {
	const pixels = Array.from({ length: width * height * 3 }, () => 0);
	for (const pixelIndex of indices) {
		const byteIndex = pixelIndex * 3;
		pixels[byteIndex] = 255;
		pixels[byteIndex + 1] = 255;
		pixels[byteIndex + 2] = 255;
	}
	return pixels;
}

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("compareTextForeground", () => {
	test("reports exact geometry for identical text masks", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "text-foreground-"));
		directories.push(directory);
		const referencePath = path.join(directory, "reference.ppm");
		const candidatePath = path.join(directory, "candidate.ppm");
		const pixels = frameWithWhitePixels({
			width: 4,
			height: 3,
			indices: [5, 6],
		});
		writePpm({ filePath: referencePath, width: 4, height: 3, pixels });
		writePpm({ filePath: candidatePath, width: 4, height: 3, pixels });

		const metrics = await compareTextForeground({
			referencePath,
			candidatePath,
			backgroundColor: "#000000",
		});

		expect(metrics.maskIou).toBe(1);
		expect(metrics.centroidDistance).toBe(0);
		expect(metrics.maximumBoundsDelta).toBe(0);
		expect(metrics.foregroundRmse).toBe(0);
	});

	test("detects a one-pixel position shift inside a mostly empty frame", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "text-foreground-"));
		directories.push(directory);
		const referencePath = path.join(directory, "reference.ppm");
		const candidatePath = path.join(directory, "candidate.ppm");
		writePpm({
			filePath: referencePath,
			width: 4,
			height: 3,
			pixels: frameWithWhitePixels({ width: 4, height: 3, indices: [5, 6] }),
		});
		writePpm({
			filePath: candidatePath,
			width: 4,
			height: 3,
			pixels: frameWithWhitePixels({ width: 4, height: 3, indices: [6, 7] }),
		});

		const metrics = await compareTextForeground({
			referencePath,
			candidatePath,
			backgroundColor: "#000000",
		});

		expect(metrics.maskIou).toBeCloseTo(1 / 3);
		expect(metrics.centroidDistance).toBe(1);
		expect(metrics.maximumBoundsDelta).toBe(1);
		expect(metrics.foregroundRmse).toBeCloseTo(Math.sqrt((2 * 255 ** 2) / 3));
	});

	test("separates low-intensity glow coverage from core text geometry", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "text-foreground-"));
		directories.push(directory);
		const referencePath = path.join(directory, "reference.ppm");
		const candidatePath = path.join(directory, "candidate.ppm");
		const reference = frameWithWhitePixels({
			width: 5,
			height: 1,
			indices: [2],
		});
		const candidate = [...reference];
		reference[3] = 12;
		reference[4] = 12;
		reference[5] = 12;
		candidate[9] = 12;
		candidate[10] = 12;
		candidate[11] = 12;
		writePpm({
			filePath: referencePath,
			width: 5,
			height: 1,
			pixels: reference,
		});
		writePpm({
			filePath: candidatePath,
			width: 5,
			height: 1,
			pixels: candidate,
		});

		const comparison = await compareTextForegroundAndGeometry({
			referencePath,
			candidatePath,
			backgroundColor: "#000000",
		});

		expect(comparison.foreground.maskIou).toBeCloseTo(1 / 3);
		expect(comparison.geometry.maskIou).toBe(1);
		expect(comparison.geometry.maximumBoundsDelta).toBe(0);
	});
});
