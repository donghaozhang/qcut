import { describe, expect, it } from "vitest";
import {
	BackSide,
	CanvasTexture,
	FrontSide,
	Mesh,
	MeshBasicMaterial,
} from "three";
import {
	createTextAnimation3DCylinder,
	resolveTextAnimation3DCameraDistance,
} from "../text-animation-3d-renderer";

const CYLINDER_PROJECTION = {
	kind: "cylinder",
	cameraFovDeg: 60,
	tiltXDeg: 20,
	yawDeg: 180,
	coverage: 5 / 6,
	radiusRatio: 1.2 / (Math.PI * 2),
} as const;

const CYLINDER_GRAPHEMES = [
	{
		index: 0,
		start: 0,
		end: 1,
		lineIndex: 0,
		bounds: { x: 0, y: 0, width: 100, height: 120 },
	},
	{
		index: 1,
		start: 1,
		end: 2,
		lineIndex: 0,
		bounds: { x: 100, y: 0, width: 100, height: 120 },
	},
] as const;

const CYLINDER_TEXTURE_BOUNDS = {
	x: 0,
	y: 0,
	width: 200,
	height: 120,
} as const;

describe("resolveTextAnimation3DCameraDistance", () => {
	it("keeps the near edge at the original framing distance during a Y flip", () => {
		const projection = {
			kind: "plane",
			cameraFovDeg: 30,
			groupRotationXDeg: 0,
			groupRotationYDeg: 0,
		} as const;
		const flipDepth = Math.sin((60 * Math.PI) / 180) * (976 / 2);
		const distance = resolveTextAnimation3DCameraDistance({
			width: 976,
			height: 256,
			projection,
			additionalDepth: flipDepth,
		});
		const baseDistance = 256 / (2 * Math.tan((30 * Math.PI) / 360));

		expect(distance - flipDepth).toBeCloseTo(baseDistance, 6);
	});

	it("matches Jianying's radius-based cylinder camera offset", () => {
		const baseDistance = 256 / (2 * Math.tan((60 * Math.PI) / 360));
		const radius = 976 * CYLINDER_PROJECTION.radiusRatio;
		const additionalDepth = 24;

		expect(
			resolveTextAnimation3DCameraDistance({
				width: 976,
				height: 256,
				projection: CYLINDER_PROJECTION,
				additionalDepth,
			})
		).toBeCloseTo(baseDistance + radius + additionalDepth, 6);
	});
});

describe("createTextAnimation3DCylinder", () => {
	it("places each grapheme around the shared cylinder radius", () => {
		const texture = new CanvasTexture({} as HTMLCanvasElement);
		const cylinder = createTextAnimation3DCylinder({
			width: 200,
			texture,
			projection: CYLINDER_PROJECTION,
			graphemes: CYLINDER_GRAPHEMES,
			textureBounds: CYLINDER_TEXTURE_BOUNDS,
		});
		const firstFront = cylinder.children[0] as Mesh;
		const secondFront = cylinder.children[2] as Mesh;
		const firstPositions = firstFront.geometry.getAttribute("position");
		const secondPositions = secondFront.geometry.getAttribute("position");
		const radius = 200 * CYLINDER_PROJECTION.radiusRatio;

		expect(cylinder.children).toHaveLength(4);
		expect(firstPositions.count).toBeGreaterThan(4);
		expect(secondPositions.count).toBeGreaterThan(4);
		for (const positions of [firstPositions, secondPositions]) {
			for (let index = 0; index < positions.count; index += 1) {
				expect(
					Math.hypot(positions.getX(index), positions.getZ(index))
				).toBeCloseTo(radius, 5);
			}
		}
		expect(firstPositions.getX(0)).toBeGreaterThan(0);
		expect(secondPositions.getX(secondPositions.count - 1)).toBeLessThan(0);
		expect(cylinder.rotation.order).toBe("XYZ");
		expect(cylinder.rotation.x).toBeCloseTo((20 * Math.PI) / 180, 6);
		expect(cylinder.rotation.y).toBeCloseTo(Math.PI, 6);
	});

	it("uses Jianying's shared UV mapping for both cylinder passes", () => {
		const texture = new CanvasTexture({} as HTMLCanvasElement);
		const cylinder = createTextAnimation3DCylinder({
			width: 200,
			texture,
			projection: CYLINDER_PROJECTION,
			graphemes: CYLINDER_GRAPHEMES,
			textureBounds: CYLINDER_TEXTURE_BOUNDS,
		});
		const frontMaterial = (cylinder.children[0] as Mesh)
			.material as MeshBasicMaterial;
		const backMaterial = (cylinder.children[1] as Mesh)
			.material as MeshBasicMaterial;
		const frontUv = (cylinder.children[0] as Mesh).geometry.getAttribute("uv");
		const backUv = (cylinder.children[1] as Mesh).geometry.getAttribute("uv");

		expect(frontMaterial.side).toBe(FrontSide);
		expect(frontMaterial.map).toBe(texture);
		expect(frontMaterial.depthTest).toBe(false);
		expect(frontMaterial.depthWrite).toBe(false);
		expect(backMaterial.side).toBe(BackSide);
		expect(backMaterial.map).toBe(texture);
		expect(backMaterial.depthTest).toBe(false);
		expect(backMaterial.depthWrite).toBe(false);
		expect(frontUv.array).toEqual(backUv.array);
	});
});
