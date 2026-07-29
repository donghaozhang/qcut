import { describe, expect, it, vi } from "vitest";
import {
	BackSide,
	CanvasTexture,
	FrontSide,
	PerspectiveCamera,
	Scene,
	type WebGLRenderer,
} from "three";
import {
	createTextAnimation3DCylinder,
	renderTextAnimation3DCylinderPasses,
} from "../text-animation-3d-cylinder";
import { resolveTextAnimation3DCameraDistance } from "../text-animation-3d-renderer";

const CYLINDER_PROJECTION = {
	kind: "cylinder",
	cameraFovDeg: 60,
	tiltXDeg: 20,
	yawDeg: 180,
	coverage: 5 / 6,
	radiusRatio: 1.2 / (Math.PI * 2),
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
	it("wraps the complete text texture around one continuous cylinder", () => {
		const texture = new CanvasTexture({} as HTMLCanvasElement);
		const cylinder = createTextAnimation3DCylinder({
			width: 200,
			height: 120,
			texture,
			projection: CYLINDER_PROJECTION,
		});
		const positions = cylinder.front.geometry.getAttribute("position");
		const radius = 200 * CYLINDER_PROJECTION.radiusRatio;

		expect(cylinder.group.children).toEqual([cylinder.back, cylinder.front]);
		expect(cylinder.front.geometry).toBe(cylinder.back.geometry);
		expect(positions.count).toBeGreaterThan(128);
		for (let index = 0; index < positions.count; index += 1) {
			expect(
				Math.hypot(positions.getX(index), positions.getZ(index))
			).toBeCloseTo(radius, 5);
		}
		expect(positions.getX(0)).toBeCloseTo(0, 5);
		expect(positions.getZ(0)).toBeCloseTo(-radius, 5);
		expect(positions.getX(positions.count - 2)).toBeCloseTo(0, 5);
		expect(positions.getZ(positions.count - 2)).toBeCloseTo(-radius, 5);
		expect(cylinder.group.rotation.order).toBe("XYZ");
		expect(cylinder.group.rotation.x).toBeCloseTo((20 * Math.PI) / 180, 6);
		expect(cylinder.group.rotation.y).toBeCloseTo(Math.PI, 6);
	});

	it("uses Jianying's stretched UV mapping for both cylinder passes", () => {
		const texture = new CanvasTexture({} as HTMLCanvasElement);
		const cylinder = createTextAnimation3DCylinder({
			width: 200,
			height: 120,
			texture,
			projection: CYLINDER_PROJECTION,
		});

		expect(cylinder.front.material.side).toBe(FrontSide);
		expect(cylinder.front.material.map).toBe(texture);
		expect(cylinder.front.material.depthTest).toBe(false);
		expect(cylinder.front.material.depthWrite).toBe(false);
		expect(cylinder.back.material.side).toBe(BackSide);
		expect(cylinder.back.material.map).toBe(texture);
		expect(cylinder.back.material.depthTest).toBe(false);
		expect(cylinder.back.material.depthWrite).toBe(false);
		expect(texture.repeat.x).toBeCloseTo(1.2, 6);
		expect(texture.offset.x).toBeCloseTo(-0.1, 6);
	});

	it("renders the back and front as separate passes", () => {
		const texture = new CanvasTexture({} as HTMLCanvasElement);
		const passes = createTextAnimation3DCylinder({
			width: 200,
			height: 120,
			texture,
			projection: CYLINDER_PROJECTION,
		});
		const visibilityDuringRender: boolean[][] = [];
		const renderer = {
			autoClear: true,
			clear: vi.fn(),
			clearDepth: vi.fn(),
			render: vi.fn(() => {
				visibilityDuringRender.push([
					passes.back.visible,
					passes.front.visible,
				]);
			}),
		} as unknown as WebGLRenderer;

		renderTextAnimation3DCylinderPasses({
			renderer,
			scene: new Scene(),
			camera: new PerspectiveCamera(),
			passes,
		});

		expect(visibilityDuringRender).toEqual([
			[true, false],
			[false, true],
		]);
		expect(renderer.clear).toHaveBeenCalledOnce();
		expect(renderer.clearDepth).toHaveBeenCalledOnce();
		expect(renderer.render).toHaveBeenCalledTimes(2);
		expect(renderer.autoClear).toBe(true);
		expect(passes.back.visible).toBe(true);
		expect(passes.front.visible).toBe(true);
	});
});
