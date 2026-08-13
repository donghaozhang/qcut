import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { TextAnimationProjectionState } from "@qcut/editor-core";
import type { CanvasTextContext } from "../text-canvas-primitives";
import {
	buildTextAnimationProjectionMesh,
	drawTextAnimationProjectedSurface,
} from "../text-animation-projective-surface";

interface AlphaBounds {
	count: number;
	height: number;
	width: number;
}

function findAlphaBounds({ canvas }: { canvas: Canvas }): AlphaBounds {
	const context = canvas.getContext("2d");
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
	let count = 0;
	let left = canvas.width;
	let right = -1;
	let top = canvas.height;
	let bottom = -1;
	for (let y = 0; y < canvas.height; y += 1) {
		for (let x = 0; x < canvas.width; x += 1) {
			const alpha = pixels[(y * canvas.width + x) * 4 + 3];
			if (alpha === 0) continue;
			count += 1;
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
		}
	}
	return {
		count,
		width: right >= left ? right - left + 1 : 0,
		height: bottom >= top ? bottom - top + 1 : 0,
	};
}

function createTransparentTexture() {
	const canvas = createCanvas(160, 80);
	const context = canvas.getContext("2d");
	context.fillStyle = "#ff3355";
	context.fillRect(8, 8, 144, 64);
	return canvas;
}

function renderProjection({
	projection,
}: {
	projection: TextAnimationProjectionState;
}) {
	const source = createTransparentTexture();
	const output = createCanvas(400, 300);
	const drawnTriangles = drawTextAnimationProjectedSurface({
		centerX: 200,
		centerY: 150,
		ctx: output.getContext("2d") as unknown as CanvasTextContext,
		height: source.height,
		projection,
		source: source as unknown as CanvasImageSource,
		width: source.width,
	});
	return {
		bounds: findAlphaBounds({ canvas: output }),
		drawnTriangles,
		output,
	};
}

describe("portable text animation projective surface", () => {
	it("maps an unrotated plane one-to-one around its requested center", () => {
		const mesh = buildTextAnimationProjectionMesh({
			centerX: 100,
			centerY: 75,
			width: 160,
			height: 80,
			projection: {
				kind: "plane",
				cameraFovDeg: 30,
				rotationXDeg: 0,
				rotationYDeg: 0,
			},
		});
		const xValues = mesh.vertices.map(({ x }) => x);
		const yValues = mesh.vertices.map(({ y }) => y);

		expect(Math.min(...xValues)).toBeCloseTo(20);
		expect(Math.max(...xValues)).toBeCloseTo(180);
		expect(Math.min(...yValues)).toBeCloseTo(35);
		expect(Math.max(...yValues)).toBeCloseTo(115);
		expect(mesh.triangles.length).toBeGreaterThan(0);
	});

	it("narrows and depth-skews a plane during a real Y-axis rotation", () => {
		const flat = renderProjection({
			projection: {
				kind: "plane",
				cameraFovDeg: 30,
				rotationXDeg: 0,
				rotationYDeg: 0,
			},
		});
		const rotated = renderProjection({
			projection: {
				kind: "plane",
				cameraFovDeg: 30,
				rotationXDeg: 0,
				rotationYDeg: 60,
			},
		});

		expect(rotated.drawnTriangles).toBeGreaterThan(0);
		expect(rotated.bounds.count).toBeGreaterThan(500);
		expect(rotated.bounds.width).toBeLessThan(flat.bounds.width);
		expect(rotated.bounds.height).toBeGreaterThan(40);
		const cornerAlpha = rotated.output.getContext("2d").getImageData(0, 0, 1, 1)
			.data[3];
		expect(cornerAlpha).toBe(0);
	});

	it("wraps the same transparent texture over a curved cylinder mesh", () => {
		const rendered = renderProjection({
			projection: {
				kind: "cylinder",
				cameraFovDeg: 60,
				tiltXDeg: 20,
				yawDeg: 0,
				coverage: 5 / 6,
				radiusRatio: 1.2 / (Math.PI * 2),
			},
		});

		expect(rendered.drawnTriangles).toBeGreaterThan(100);
		expect(rendered.bounds.count).toBeGreaterThan(300);
		expect(rendered.bounds.width).toBeGreaterThan(25);
		expect(rendered.bounds.height).toBeGreaterThan(25);
	});
});
