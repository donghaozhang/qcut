import { buildPlanarHomography, projectPlanarPoint } from "@qcut/editor-core";
import type { MediaPerspective } from "@/types/timeline";
import { DEFAULT_MEDIA_PERSPECTIVE } from "./video-properties";

export function isDefaultMediaPerspective(
	perspective: MediaPerspective
): boolean {
	return Object.entries(DEFAULT_MEDIA_PERSPECTIVE).every(
		([key, value]) =>
			Math.abs(perspective[key as keyof MediaPerspective] - value) < 1e-6
	);
}

export function buildPerspectiveMatrix3d({
	width,
	height,
	perspective,
}: {
	width: number;
	height: number;
	perspective: MediaPerspective;
}): number[] | null {
	if (width <= 0 || height <= 0) return null;
	const matrix = buildPlanarHomography({
		source: {
			topLeft: { x: 0, y: 0 },
			topRight: { x: width, y: 0 },
			bottomRight: { x: width, y: height },
			bottomLeft: { x: 0, y: height },
		},
		destination: {
			topLeft: {
				x: perspective.topLeftX * width,
				y: perspective.topLeftY * height,
			},
			topRight: {
				x: perspective.topRightX * width,
				y: perspective.topRightY * height,
			},
			bottomRight: {
				x: perspective.bottomRightX * width,
				y: perspective.bottomRightY * height,
			},
			bottomLeft: {
				x: perspective.bottomLeftX * width,
				y: perspective.bottomLeftY * height,
			},
		},
		epsilon: 1e-9,
	});
	if (!matrix) return null;
	const [h11, h12, h13, h21, h22, h23, h31, h32] = matrix;
	return [h11, h21, 0, h31, h12, h22, 0, h32, 0, 0, 1, 0, h13, h23, 0, 1];
}

export function projectMediaPerspectivePoint({
	x,
	y,
	matrix,
}: {
	x: number;
	y: number;
	matrix: number[];
}): { x: number; y: number } {
	const projected = projectPlanarPoint({
		point: { x, y },
		matrix: [
			matrix[0],
			matrix[4],
			matrix[12],
			matrix[1],
			matrix[5],
			matrix[13],
			matrix[3],
			matrix[7],
			matrix[15],
		],
		epsilon: 1e-9,
	});
	return projected ?? { x, y };
}

export function buildCssPerspectiveTransform({
	width,
	height,
	perspective,
}: {
	width: number;
	height: number;
	perspective: MediaPerspective;
}): string | undefined {
	if (isDefaultMediaPerspective(perspective)) return undefined;
	const matrix = buildPerspectiveMatrix3d({ width, height, perspective });
	return matrix ? `matrix3d(${matrix.join(",")})` : undefined;
}
