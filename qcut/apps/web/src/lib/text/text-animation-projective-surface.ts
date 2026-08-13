import type { TextAnimationProjectionState } from "@qcut/editor-core";
import type { CanvasTextContext } from "./text-canvas-primitives";

interface SurfacePoint3D {
	x: number;
	y: number;
	z: number;
}

export interface TextAnimationSurfaceTransform {
	rotationXDeg?: number;
	rotationYDeg?: number;
	rotationZDeg?: number;
	scaleX?: number;
	scaleY?: number;
	translateX?: number;
	translateY?: number;
	translateZ?: number;
}

export interface TextAnimationProjectedVertex {
	x: number;
	y: number;
	depth: number;
	sourceX: number;
	sourceY: number;
}

export interface TextAnimationProjectedTriangle {
	vertices: readonly [
		TextAnimationProjectedVertex,
		TextAnimationProjectedVertex,
		TextAnimationProjectedVertex,
	];
	depth: number;
}

export interface TextAnimationProjectionMesh {
	triangles: TextAnimationProjectedTriangle[];
	vertices: TextAnimationProjectedVertex[];
}

interface AffineMatrix {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

const MINIMUM_SURFACE_SIZE = 0.01;
const MINIMUM_TRIANGLE_AREA = 1e-5;
const MINIMUM_AFFINE_DETERMINANT = 1e-7;

function clamp({
	value,
	minimum,
	maximum,
}: {
	value: number;
	minimum: number;
	maximum: number;
}) {
	return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians({ value }: { value: number }) {
	return (value * Math.PI) / 180;
}

function rotateAroundX({
	point,
	angle,
}: {
	point: SurfacePoint3D;
	angle: number;
}): SurfacePoint3D {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		x: point.x,
		y: point.y * cosine - point.z * sine,
		z: point.y * sine + point.z * cosine,
	};
}

function rotateAroundY({
	point,
	angle,
}: {
	point: SurfacePoint3D;
	angle: number;
}): SurfacePoint3D {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		x: point.x * cosine + point.z * sine,
		y: point.y,
		z: -point.x * sine + point.z * cosine,
	};
}

function rotateAroundZ({
	point,
	angle,
}: {
	point: SurfacePoint3D;
	angle: number;
}): SurfacePoint3D {
	const cosine = Math.cos(angle);
	const sine = Math.sin(angle);
	return {
		x: point.x * cosine - point.y * sine,
		y: point.x * sine + point.y * cosine,
		z: point.z,
	};
}

function applySurfaceTransform({
	point,
	rotationXDeg,
	rotationYDeg,
	transform,
}: {
	point: SurfacePoint3D;
	rotationXDeg: number;
	rotationYDeg: number;
	transform?: TextAnimationSurfaceTransform;
}) {
	const scaled = {
		x: point.x * (transform?.scaleX ?? 1),
		y: point.y * (transform?.scaleY ?? 1),
		z: point.z,
	};
	const rolled = rotateAroundZ({
		point: scaled,
		angle: degreesToRadians({ value: transform?.rotationZDeg ?? 0 }),
	});
	const pitched = rotateAroundX({
		point: rolled,
		angle: degreesToRadians({
			value: rotationXDeg + (transform?.rotationXDeg ?? 0),
		}),
	});
	const yawed = rotateAroundY({
		point: pitched,
		angle: degreesToRadians({
			value: rotationYDeg + (transform?.rotationYDeg ?? 0),
		}),
	});
	return {
		x: yawed.x + (transform?.translateX ?? 0),
		y: yawed.y + (transform?.translateY ?? 0),
		z: yawed.z + (transform?.translateZ ?? 0),
	};
}

function planePoint({
	u,
	v,
	width,
	height,
	projection,
	transform,
}: {
	u: number;
	v: number;
	width: number;
	height: number;
	projection: Extract<TextAnimationProjectionState, { kind: "plane" }>;
	transform?: TextAnimationSurfaceTransform;
}) {
	const local = {
		x: (u - 0.5) * width,
		y: (v - 0.5) * height,
		z: 0,
	};
	return applySurfaceTransform({
		point: local,
		rotationXDeg: projection.rotationXDeg,
		rotationYDeg: projection.rotationYDeg,
		transform,
	});
}

function cylinderPoint({
	u,
	v,
	width,
	height,
	projection,
	transform,
}: {
	u: number;
	v: number;
	width: number;
	height: number;
	projection: Extract<TextAnimationProjectionState, { kind: "cylinder" }>;
	transform?: TextAnimationSurfaceTransform;
}) {
	const coverage = clamp({
		value: projection.coverage,
		minimum: 0.05,
		maximum: 1,
	});
	const radius = width * Math.max(0.01, projection.radiusRatio);
	const yaw = degreesToRadians({ value: projection.yawDeg });
	const angle = (u - 0.5) * Math.PI * 2 * coverage + yaw;
	const local = {
		x: Math.sin(angle) * radius,
		y: (v - 0.5) * height,
		// Keep the front tangent at z=0. Rotation moves the texture away from
		// the camera without changing its resting size or risking a near-plane hit.
		z: (Math.cos(angle) - 1) * radius,
	};
	return applySurfaceTransform({
		point: local,
		rotationXDeg: projection.tiltXDeg,
		rotationYDeg: 0,
		transform,
	});
}

function meshSegments({
	width,
	height,
	projection,
}: {
	width: number;
	height: number;
	projection: TextAnimationProjectionState;
}) {
	if (projection.kind === "cylinder") {
		return {
			columns: Math.ceil(
				clamp({ value: width / 10, minimum: 24, maximum: 96 })
			),
			rows: Math.ceil(clamp({ value: height / 32, minimum: 2, maximum: 10 })),
		};
	}
	return {
		columns: Math.ceil(clamp({ value: width / 24, minimum: 4, maximum: 32 })),
		rows: Math.ceil(clamp({ value: height / 24, minimum: 2, maximum: 12 })),
	};
}

function cameraDistance({
	height,
	width,
	maximumDepth,
	fovDeg,
}: {
	height: number;
	width: number;
	maximumDepth: number;
	fovDeg: number;
}) {
	const fov = degreesToRadians({
		value: clamp({ value: fovDeg, minimum: 10, maximum: 140 }),
	});
	const distanceForHeight = height / (2 * Math.tan(fov / 2));
	const nearMargin = Math.max(1, Math.max(width, height) * 0.05);
	return distanceForHeight + maximumDepth + nearMargin;
}

function triangleArea({
	first,
	second,
	third,
}: {
	first: TextAnimationProjectedVertex;
	second: TextAnimationProjectedVertex;
	third: TextAnimationProjectedVertex;
}) {
	return (
		(second.x - first.x) * (third.y - first.y) -
		(second.y - first.y) * (third.x - first.x)
	);
}

function createTriangle({
	first,
	second,
	third,
}: {
	first: TextAnimationProjectedVertex;
	second: TextAnimationProjectedVertex;
	third: TextAnimationProjectedVertex;
}): TextAnimationProjectedTriangle | null {
	if (
		Math.abs(triangleArea({ first, second, third })) < MINIMUM_TRIANGLE_AREA
	) {
		return null;
	}
	return {
		vertices: [first, second, third],
		depth: (first.depth + second.depth + third.depth) / 3,
	};
}

export function buildTextAnimationProjectionMesh({
	centerX,
	centerY,
	height,
	projection,
	transform,
	width,
}: {
	centerX: number;
	centerY: number;
	height: number;
	projection: TextAnimationProjectionState;
	transform?: TextAnimationSurfaceTransform;
	width: number;
}): TextAnimationProjectionMesh {
	if (
		![centerX, centerY, height, width].every(Number.isFinite) ||
		width < MINIMUM_SURFACE_SIZE ||
		height < MINIMUM_SURFACE_SIZE
	) {
		return { triangles: [], vertices: [] };
	}
	const { columns, rows } = meshSegments({ width, height, projection });
	const points: SurfacePoint3D[] = [];
	for (let row = 0; row <= rows; row += 1) {
		for (let column = 0; column <= columns; column += 1) {
			const u = column / columns;
			const v = row / rows;
			points.push(
				projection.kind === "plane"
					? planePoint({ u, v, width, height, projection, transform })
					: cylinderPoint({ u, v, width, height, projection, transform })
			);
		}
	}
	const maximumDepth = Math.max(0, ...points.map(({ z }) => z));
	const distance = cameraDistance({
		height,
		width,
		maximumDepth,
		fovDeg: projection.cameraFovDeg,
	});
	const vertices = points.map((point, index) => {
		const row = Math.floor(index / (columns + 1));
		const column = index % (columns + 1);
		const perspective = distance / Math.max(1e-3, distance - point.z);
		return {
			x: centerX + point.x * perspective,
			y: centerY + point.y * perspective,
			depth: point.z,
			sourceX: (column / columns) * width,
			sourceY: (row / rows) * height,
		};
	});
	const triangles: TextAnimationProjectedTriangle[] = [];
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const topLeft = vertices[row * (columns + 1) + column];
			const topRight = vertices[row * (columns + 1) + column + 1];
			const bottomLeft = vertices[(row + 1) * (columns + 1) + column];
			const bottomRight = vertices[(row + 1) * (columns + 1) + column + 1];
			const first = createTriangle({
				first: topLeft,
				second: topRight,
				third: bottomLeft,
			});
			const second = createTriangle({
				first: bottomLeft,
				second: topRight,
				third: bottomRight,
			});
			if (first) triangles.push(first);
			if (second) triangles.push(second);
		}
	}
	triangles.sort((left, right) => left.depth - right.depth);
	return { triangles, vertices };
}

function affineMatrixForTriangle({
	vertices,
}: {
	vertices: TextAnimationProjectedTriangle["vertices"];
}): AffineMatrix | null {
	const [first, second, third] = vertices;
	const determinant =
		first.sourceX * (second.sourceY - third.sourceY) +
		second.sourceX * (third.sourceY - first.sourceY) +
		third.sourceX * (first.sourceY - second.sourceY);
	if (Math.abs(determinant) < MINIMUM_AFFINE_DETERMINANT) return null;
	return {
		a:
			(first.x * (second.sourceY - third.sourceY) +
				second.x * (third.sourceY - first.sourceY) +
				third.x * (first.sourceY - second.sourceY)) /
			determinant,
		b:
			(first.y * (second.sourceY - third.sourceY) +
				second.y * (third.sourceY - first.sourceY) +
				third.y * (first.sourceY - second.sourceY)) /
			determinant,
		c:
			(first.x * (third.sourceX - second.sourceX) +
				second.x * (first.sourceX - third.sourceX) +
				third.x * (second.sourceX - first.sourceX)) /
			determinant,
		d:
			(first.y * (third.sourceX - second.sourceX) +
				second.y * (first.sourceX - third.sourceX) +
				third.y * (second.sourceX - first.sourceX)) /
			determinant,
		e:
			(first.x *
				(second.sourceX * third.sourceY - third.sourceX * second.sourceY) +
				second.x *
					(third.sourceX * first.sourceY - first.sourceX * third.sourceY) +
				third.x *
					(first.sourceX * second.sourceY - second.sourceX * first.sourceY)) /
			determinant,
		f:
			(first.y *
				(second.sourceX * third.sourceY - third.sourceX * second.sourceY) +
				second.y *
					(third.sourceX * first.sourceY - first.sourceX * third.sourceY) +
				third.y *
					(first.sourceX * second.sourceY - second.sourceX * first.sourceY)) /
			determinant,
	};
}

export function drawTextAnimationProjectedSurface({
	centerX,
	centerY,
	ctx,
	height,
	projection,
	source,
	transform,
	width,
}: {
	centerX: number;
	centerY: number;
	ctx: CanvasTextContext;
	height: number;
	projection: TextAnimationProjectionState;
	source: CanvasImageSource;
	transform?: TextAnimationSurfaceTransform;
	width: number;
}) {
	const mesh = buildTextAnimationProjectionMesh({
		centerX,
		centerY,
		height,
		projection,
		transform,
		width,
	});
	let drawnTriangles = 0;
	for (const triangle of mesh.triangles) {
		const matrix = affineMatrixForTriangle({ vertices: triangle.vertices });
		if (!matrix) continue;
		const [first, second, third] = triangle.vertices;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(first.x, first.y);
		ctx.lineTo(second.x, second.y);
		ctx.lineTo(third.x, third.y);
		ctx.closePath();
		ctx.clip();
		ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
		ctx.drawImage(source, 0, 0);
		ctx.restore();
		drawnTriangles += 1;
	}
	return drawnTriangles;
}
