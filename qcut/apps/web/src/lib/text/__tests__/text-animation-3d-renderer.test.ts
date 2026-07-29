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

	it("accounts for the cylinder radius, tilt, and per-glyph depth", () => {
		const baseDistance = 256 / (2 * Math.tan((60 * Math.PI) / 360));
		const radius = 976 * CYLINDER_PROJECTION.radiusRatio;
		const tiltDepth = Math.sin((20 * Math.PI) / 180) * (256 / 2);
		const additionalDepth = 24;

		expect(
			resolveTextAnimation3DCameraDistance({
				width: 976,
				height: 256,
				projection: CYLINDER_PROJECTION,
				additionalDepth,
			})
		).toBeCloseTo(baseDistance + radius + tiltDepth + additionalDepth, 6);
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
		const radius = 200 * CYLINDER_PROJECTION.radiusRatio;

		expect(cylinder.children).toHaveLength(4);
		expect(firstFront.position.length()).toBeCloseTo(radius, 6);
		expect(secondFront.position.length()).toBeCloseTo(radius, 6);
		expect(firstFront.position.x).toBeGreaterThan(0);
		expect(secondFront.position.x).toBeLessThan(0);
		expect(cylinder.rotation.order).toBe("YXZ");
		expect(cylinder.rotation.x).toBeCloseTo((-20 * Math.PI) / 180, 6);
		expect(cylinder.rotation.y).toBeCloseTo(Math.PI, 6);
	});

	it("renders readable front and mirrored back textures separately", () => {
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
		expect(backMaterial.side).toBe(BackSide);
		expect(backMaterial.map).toBe(texture);
		expect(frontUv.getX(0)).toBe(backUv.getX(1));
		expect(frontUv.getX(1)).toBe(backUv.getX(0));
	});
});
