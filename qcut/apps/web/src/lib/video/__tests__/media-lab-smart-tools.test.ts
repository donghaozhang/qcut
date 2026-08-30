import { describe, expect, it } from "vitest";
import type { MediaMask, MediaPropertyKeyframe } from "@/types/timeline";
import {
	planExperimentalCameraTracking,
	planExperimentalSmartCrop,
	planExperimentalSmartMotion,
} from "../media-lab-smart-tools";

function keyframe({
	id,
	frame,
	value,
}: {
	id: string;
	frame: number;
	value: number;
}): MediaPropertyKeyframe {
	return { id, frame, value, easing: "linear" };
}

function trackedMask({
	overrides = {},
}: {
	overrides?: Partial<MediaMask>;
} = {}): MediaMask {
	return {
		id: "subject",
		type: "person",
		centerX: 0.25,
		centerY: 0.5,
		width: 0.2,
		height: 0.4,
		rotation: 0,
		feather: 0,
		invert: false,
		keyframes: {
			centerX: [
				keyframe({ id: "source-x-0", frame: 0, value: 0.25 }),
				keyframe({ id: "source-x-30", frame: 30, value: 0.75 }),
			],
			centerY: [
				keyframe({ id: "source-y-0", frame: 0, value: 0.5 }),
				keyframe({ id: "source-y-30", frame: 30, value: 0.5 }),
			],
			width: [
				keyframe({ id: "source-width-0", frame: 0, value: 0.2 }),
				keyframe({ id: "source-width-30", frame: 30, value: 0.2 }),
			],
			height: [
				keyframe({ id: "source-height-0", frame: 0, value: 0.4 }),
				keyframe({ id: "source-height-30", frame: 30, value: 0.4 }),
			],
		},
		...overrides,
	};
}

const DEFAULT_INPUT = {
	canvasWidth: 1000,
	canvasHeight: 500,
	clipDuration: 1,
	fps: 30,
} as const;

describe("media lab smart tools", () => {
	it("centers a tracked subject without creating scale keyframes", () => {
		const plan = planExperimentalCameraTracking({
			mask: trackedMask(),
			...DEFAULT_INPUT,
		});

		expect(plan.keyframes.x?.map(({ value }) => value)).toEqual([250, -250]);
		expect(plan.keyframes.y?.map(({ value }) => value)).toEqual([0, 0]);
		expect(plan.keyframes.scaleX).toBeUndefined();
		expect(plan.keyframes.scaleY).toBeUndefined();
		expect(plan.baseTransformUpdates).toEqual({ x: 250, y: 0 });
	});

	it("uses deterministic tool-specific IDs", () => {
		const first = planExperimentalCameraTracking({
			mask: trackedMask(),
			...DEFAULT_INPUT,
		});
		const second = planExperimentalCameraTracking({
			mask: trackedMask(),
			...DEFAULT_INPUT,
		});

		expect(second).toEqual(first);
		expect(first.keyframes.x?.[0].id).toBe(
			"subject-media-lab-camera-tracking-x-0"
		);
	});

	it("smooths a one-frame tracking spike", () => {
		const plan = planExperimentalCameraTracking({
			mask: trackedMask({
				overrides: {
					keyframes: {
						centerX: [
							keyframe({ id: "x-0", frame: 0, value: 0.5 }),
							keyframe({ id: "x-15", frame: 15, value: 0.9 }),
							keyframe({ id: "x-30", frame: 30, value: 0.5 }),
						],
					},
				},
			}),
			...DEFAULT_INPUT,
		});

		expect(plan.keyframes.x?.map(({ value }) => value)).toEqual([0, -120, 0]);
	});

	it("creates a restrained push and partial pan", () => {
		const plan = planExperimentalSmartMotion({
			mask: trackedMask({
				overrides: {
					keyframes: {
						centerX: [
							keyframe({ id: "x-0", frame: 0, value: 0 }),
							keyframe({ id: "x-30", frame: 30, value: 1 }),
						],
						centerY: [
							keyframe({ id: "y-0", frame: 0, value: 0 }),
							keyframe({ id: "y-30", frame: 30, value: 1 }),
						],
					},
				},
			}),
			...DEFAULT_INPUT,
		});

		expect(plan.keyframes.scaleX?.map(({ value }) => value)).toEqual([
			1.04, 1.14,
		]);
		expect(plan.keyframes.scaleY?.map(({ value }) => value)).toEqual(
			plan.keyframes.scaleX?.map(({ value }) => value)
		);
		expect(plan.keyframes.x?.every(({ value }) => Math.abs(value) <= 120)).toBe(
			true
		);
		expect(plan.keyframes.y?.every(({ value }) => Math.abs(value) <= 50)).toBe(
			true
		);
	});

	it("uses stronger subject-aware scale for smart crop", () => {
		const mask = trackedMask();
		const motion = planExperimentalSmartMotion({ mask, ...DEFAULT_INPUT });
		const crop = planExperimentalSmartCrop({ mask, ...DEFAULT_INPUT });
		const cropScale = crop.keyframes.scaleX?.[0].value ?? 0;
		const motionScale = motion.keyframes.scaleX?.[0].value ?? 0;

		expect(cropScale).toBe(1.95);
		expect(cropScale).toBeGreaterThan(motionScale);
		expect(crop.keyframes.scaleY?.map(({ value }) => value)).toEqual(
			crop.keyframes.scaleX?.map(({ value }) => value)
		);
	});

	it("keeps smart-cropped subject bounds within the canvas", () => {
		const mask = trackedMask({
			overrides: {
				centerX: 0.8,
				centerY: 0.7,
				width: 0.25,
				height: 0.35,
				keyframes: {
					centerX: [keyframe({ id: "x", frame: 0, value: 0.8 })],
					centerY: [keyframe({ id: "y", frame: 0, value: 0.7 })],
					width: [keyframe({ id: "w", frame: 0, value: 0.25 })],
					height: [keyframe({ id: "h", frame: 0, value: 0.35 })],
				},
			},
		});
		const plan = planExperimentalSmartCrop({ mask, ...DEFAULT_INPUT });
		const scale = plan.keyframes.scaleX?.[0].value ?? 1;
		const x = plan.keyframes.x?.[0].value ?? 0;
		const y = plan.keyframes.y?.[0].value ?? 0;
		const centerX = 0.5 + (mask.centerX - 0.5) * scale + x / 1000;
		const centerY = 0.5 + (mask.centerY - 0.5) * scale + y / 500;

		expect(centerX - (mask.width * scale) / 2).toBeGreaterThanOrEqual(0);
		expect(centerX + (mask.width * scale) / 2).toBeLessThanOrEqual(1);
		expect(centerY - (mask.height * scale) / 2).toBeGreaterThanOrEqual(0);
		expect(centerY + (mask.height * scale) / 2).toBeLessThanOrEqual(1);
	});

	it("uses base mask values when tracked properties are sparse", () => {
		const plan = planExperimentalCameraTracking({
			mask: trackedMask({
				overrides: {
					centerY: 0.25,
					keyframes: {
						centerX: [keyframe({ id: "x-15", frame: 15, value: 0.6 })],
					},
				},
			}),
			...DEFAULT_INPUT,
		});

		expect(plan.keyframes.x?.map(({ frame }) => frame)).toEqual([0, 15, 30]);
		expect(plan.keyframes.x?.map(({ value }) => value)).toEqual([
			-100, -100, -100,
		]);
		expect(plan.keyframes.y?.map(({ value }) => value)).toEqual([
			125, 125, 125,
		]);
	});

	it("filters invalid, duplicate, and out-of-range tracking keyframes", () => {
		const mask = trackedMask({
			overrides: {
				keyframes: {
					centerX: [
						keyframe({ id: "negative", frame: -1, value: 0.1 }),
						keyframe({ id: "first", frame: 10, value: 0.2 }),
						keyframe({ id: "replacement", frame: 10, value: 0.8 }),
						keyframe({ id: "invalid", frame: 20, value: Number.NaN }),
						keyframe({ id: "late", frame: 31, value: 0.9 }),
					],
				},
			},
		});
		const plan = planExperimentalCameraTracking({ mask, ...DEFAULT_INPUT });

		expect(plan.keyframes.x?.map(({ frame }) => frame)).toEqual([0, 10, 30]);
		expect(plan.keyframes.x?.map(({ value }) => value)).toEqual([
			-300, -300, -300,
		]);
	});

	it("clamps normalized samples, scale, and offsets to finite limits", () => {
		const plan = planExperimentalSmartCrop({
			mask: trackedMask({
				overrides: {
					keyframes: {
						centerX: [keyframe({ id: "x", frame: 0, value: 50 })],
						centerY: [keyframe({ id: "y", frame: 0, value: -50 })],
						width: [keyframe({ id: "w", frame: 0, value: 0.0001 })],
						height: [keyframe({ id: "h", frame: 0, value: 0.0001 })],
					},
				},
			}),
			...DEFAULT_INPUT,
		});

		expect(plan.keyframes.scaleX?.every(({ value }) => value === 2.75)).toBe(
			true
		);
		expect(
			Object.values(plan.keyframes)
				.flatMap((keyframes) => keyframes ?? [])
				.every(({ value }) => Number.isFinite(value))
		).toBe(true);
		expect(plan.keyframes.x?.every(({ value }) => Math.abs(value) <= 875)).toBe(
			true
		);
		expect(
			plan.keyframes.y?.every(({ value }) => Math.abs(value) <= 437.5)
		).toBe(true);
		const scale = plan.keyframes.scaleX?.[0].value ?? 1;
		const x = plan.keyframes.x?.[0].value ?? 0;
		const y = plan.keyframes.y?.[0].value ?? 0;
		const centerX = 0.5 + (0.995 - 0.5) * scale + x / 1000;
		const centerY = 0.5 + (0.005 - 0.5) * scale + y / 500;
		expect(centerX + 0.005 * scale).toBeLessThanOrEqual(1);
		expect(centerY - 0.005 * scale).toBeCloseTo(0, 6);
	});

	it("returns an empty plan for invalid timing, canvas, or tracking data", () => {
		const validMask = trackedMask();
		const noTracking = trackedMask({ overrides: { keyframes: {} } });
		const invalidPlans = [
			planExperimentalSmartMotion({
				mask: validMask,
				...DEFAULT_INPUT,
				canvasWidth: 0,
			}),
			planExperimentalSmartCrop({
				mask: validMask,
				...DEFAULT_INPUT,
				clipDuration: Number.NaN,
			}),
			planExperimentalCameraTracking({
				mask: validMask,
				...DEFAULT_INPUT,
				fps: 0,
			}),
			planExperimentalCameraTracking({
				mask: noTracking,
				...DEFAULT_INPUT,
			}),
		];

		for (const plan of invalidPlans) {
			expect(plan).toEqual({ keyframes: {}, baseTransformUpdates: {} });
		}
	});

	it("never mutates mask fields or source keyframe order", () => {
		const mask = trackedMask({
			overrides: {
				keyframes: {
					centerX: [
						keyframe({ id: "later", frame: 30, value: 0.75 }),
						keyframe({ id: "earlier", frame: 0, value: 0.25 }),
					],
				},
			},
		});
		const original = structuredClone(mask);

		planExperimentalSmartMotion({ mask, ...DEFAULT_INPUT });
		planExperimentalSmartCrop({ mask, ...DEFAULT_INPUT });
		planExperimentalCameraTracking({ mask, ...DEFAULT_INPUT });

		expect(mask).toEqual(original);
	});
});
