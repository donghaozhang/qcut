import type { MediaCrop } from "@/types/timeline";

export interface ManualBodyAffineMatrix {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

export interface ManualBodyPoint {
	x: number;
	y: number;
}

function clamp({ value }: { value: number }) {
	return Math.min(1, Math.max(0, value));
}

export function screenPointToManualBodyPoint({
	clientX,
	clientY,
	height,
	matrix,
	width,
}: {
	clientX: number;
	clientY: number;
	height: number;
	matrix: ManualBodyAffineMatrix;
	width: number;
}): ManualBodyPoint | null {
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
	if (
		!Number.isFinite(determinant) ||
		Math.abs(determinant) < Number.EPSILON ||
		width <= 0 ||
		height <= 0
	) {
		return null;
	}
	const translatedX = clientX - matrix.e;
	const translatedY = clientY - matrix.f;
	const localX =
		(matrix.d * translatedX - matrix.c * translatedY) / determinant;
	const localY =
		(-matrix.b * translatedX + matrix.a * translatedY) / determinant;
	return {
		x: clamp({ value: localX / width }),
		y: clamp({ value: localY / height }),
	};
}

export function isManualBodyPointVisibleInCrop({
	crop,
	point,
}: {
	crop: MediaCrop;
	point: ManualBodyPoint;
}) {
	return (
		point.x >= crop.left &&
		point.x <= 1 - crop.right &&
		point.y >= crop.top &&
		point.y <= 1 - crop.bottom
	);
}
