import type { MediaPerspective } from "@/types/timeline";
import { DEFAULT_MEDIA_PERSPECTIVE } from "./video-properties";

function solveLinearSystem(rows: number[][]): number[] | null {
	const size = rows.length;
	for (let column = 0; column < size; column++) {
		let pivot = column;
		for (let row = column + 1; row < size; row++) {
			if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
				pivot = row;
			}
		}
		if (Math.abs(rows[pivot][column]) < 1e-9) return null;
		[rows[column], rows[pivot]] = [rows[pivot], rows[column]];

		const divisor = rows[column][column];
		for (let index = column; index <= size; index++) {
			rows[column][index] /= divisor;
		}
		for (let row = 0; row < size; row++) {
			if (row === column) continue;
			const factor = rows[row][column];
			for (let index = column; index <= size; index++) {
				rows[row][index] -= factor * rows[column][index];
			}
		}
	}
	return rows.map((row) => row[size]);
}

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
	const source = [
		[0, 0],
		[width, 0],
		[width, height],
		[0, height],
	] as const;
	const destination = [
		[perspective.topLeftX * width, perspective.topLeftY * height],
		[perspective.topRightX * width, perspective.topRightY * height],
		[perspective.bottomRightX * width, perspective.bottomRightY * height],
		[perspective.bottomLeftX * width, perspective.bottomLeftY * height],
	] as const;
	const rows: number[][] = [];
	for (let index = 0; index < source.length; index++) {
		const [x, y] = source[index];
		const [u, v] = destination[index];
		rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
		rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
	}
	const solution = solveLinearSystem(rows);
	if (!solution) return null;
	const [h11, h12, h13, h21, h22, h23, h31, h32] = solution;
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
	const denominator = matrix[3] * x + matrix[7] * y + matrix[15];
	if (Math.abs(denominator) < 1e-9) return { x, y };
	return {
		x: (matrix[0] * x + matrix[4] * y + matrix[12]) / denominator,
		y: (matrix[1] * x + matrix[5] * y + matrix[13]) / denominator,
	};
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
