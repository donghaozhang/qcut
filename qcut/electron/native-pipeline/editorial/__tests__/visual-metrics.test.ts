import { describe, expect, it } from "vitest";
import {
	aggregateRangeMetrics,
	buildFrameSamples,
	directionFromVector,
	visualMetricsInternals,
} from "../visual-metrics.js";

const WIDTH = 32;
const HEIGHT = 18;

function flatFrame({ value }: { value: number }): Buffer {
	return Buffer.alloc(WIDTH * HEIGHT, value);
}

function stripedFrame({ offset }: { offset: number }): Buffer {
	const frame = Buffer.alloc(WIDTH * HEIGHT, 30);
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			if ((x + offset) % 6 < 3) frame[y * WIDTH + x] = 220;
		}
	}
	return frame;
}

describe("editorial visual metrics", () => {
	it("ranks detailed frames sharper than flat frames", () => {
		const flat = visualMetricsInternals.analyzeFrame({
			frame: flatFrame({ value: 100 }),
			width: WIDTH,
			height: HEIGHT,
		});
		const detailed = visualMetricsInternals.analyzeFrame({
			frame: stripedFrame({ offset: 0 }),
			width: WIDTH,
			height: HEIGHT,
		});

		expect(detailed.sharpness).toBeGreaterThan(flat.sharpness);
		expect(detailed.contrast).toBeGreaterThan(flat.contrast);
	});

	it("estimates translation and converts it to screen direction", () => {
		const motion = visualMetricsInternals.estimateMotion({
			previous: stripedFrame({ offset: 0 }),
			current: stripedFrame({ offset: -2 }),
			width: WIDTH,
			height: HEIGHT,
			maxShift: 3,
		});

		expect(motion.magnitude).toBeGreaterThan(0);
		expect(directionFromVector({ x: motion.x, y: motion.y })).toBe("right");
	});

	it("aggregates stable motion, focus, sharpness, and exposure", () => {
		const samples = buildFrameSamples({
			frames: [
				stripedFrame({ offset: 0 }),
				stripedFrame({ offset: -1 }),
				stripedFrame({ offset: -2 }),
			],
			fps: 2,
			width: WIDTH,
			height: HEIGHT,
		});
		const metrics = aggregateRangeMetrics({ samples });

		expect(metrics.sharpness).toBeGreaterThan(0);
		expect(metrics.exposure).toBeGreaterThan(0);
		expect(metrics.stability).toBeGreaterThan(0.4);
		expect(metrics.motionDirection).toBe("right");
		expect(metrics.subjectX).toBeGreaterThanOrEqual(0);
		expect(metrics.subjectX).toBeLessThanOrEqual(1);
	});
});
