import { describe, expect, it } from "vitest";
import {
	buildCssPerspectiveTransform,
	buildPerspectiveMatrix3d,
} from "../video-perspective";
import { DEFAULT_MEDIA_PERSPECTIVE } from "../video-properties";

function project(matrix: number[], x: number, y: number) {
	const denominator = matrix[3] * x + matrix[7] * y + matrix[15];
	return {
		x: (matrix[0] * x + matrix[4] * y + matrix[12]) / denominator,
		y: (matrix[1] * x + matrix[5] * y + matrix[13]) / denominator,
	};
}

describe("video perspective", () => {
	it("omits the identity transform", () => {
		expect(
			buildCssPerspectiveTransform({
				width: 1920,
				height: 1080,
				perspective: DEFAULT_MEDIA_PERSPECTIVE,
			})
		).toBeUndefined();
	});

	it("maps all source corners to the configured corner pin", () => {
		const matrix = buildPerspectiveMatrix3d({
			width: 100,
			height: 50,
			perspective: {
				topLeftX: 0.1,
				topLeftY: 0.2,
				topRightX: 0.9,
				topRightY: 0,
				bottomRightX: 1,
				bottomRightY: 0.9,
				bottomLeftX: 0,
				bottomLeftY: 1,
			},
		});
		expect(matrix).not.toBeNull();
		expect(project(matrix!, 0, 0)).toEqual({ x: 10, y: 10 });
		expect(project(matrix!, 100, 0).x).toBeCloseTo(90);
		expect(project(matrix!, 100, 0).y).toBeCloseTo(0);
		expect(project(matrix!, 100, 50).x).toBeCloseTo(100);
		expect(project(matrix!, 100, 50).y).toBeCloseTo(45);
		expect(project(matrix!, 0, 50).x).toBeCloseTo(0);
		expect(project(matrix!, 0, 50).y).toBeCloseTo(50);
	});
});
