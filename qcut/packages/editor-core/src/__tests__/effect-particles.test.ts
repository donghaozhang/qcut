import { describe, expect, it } from "vitest";
import { sampleEffectParticles } from "../effects/particles.js";
import type { EffectParticleRenderStage } from "../types/effect-render.js";

function snowStage(
	overrides: Partial<EffectParticleRenderStage> = {}
): EffectParticleRenderStage {
	return {
		kind: "particles",
		variant: "snow",
		density: 0.8,
		speed: 1,
		color: "#ffffff",
		opacity: 0.85,
		...overrides,
	};
}

describe("sampleEffectParticles", () => {
	it("is deterministic for the same stage and time", () => {
		const stage = snowStage();
		const first = sampleEffectParticles({ stage, timeSeconds: 1.5 });
		const second = sampleEffectParticles({ stage, timeSeconds: 1.5 });
		expect(second).toEqual(first);
		expect(first.length).toBeGreaterThan(0);
	});

	it("keeps every particle inside the normalized canvas bounds", () => {
		const stage = snowStage();
		for (const time of [0, 0.3, 1, 4.2]) {
			for (const particle of sampleEffectParticles({
				stage,
				timeSeconds: time,
			})) {
				expect(particle.x).toBeGreaterThanOrEqual(0);
				expect(particle.x).toBeLessThanOrEqual(1);
				expect(particle.y).toBeGreaterThanOrEqual(-0.1);
				expect(particle.y).toBeLessThanOrEqual(1.1);
				expect(particle.opacity).toBeGreaterThanOrEqual(0);
				expect(particle.opacity).toBeLessThanOrEqual(1);
			}
		}
	});

	it("scales particle count with density", () => {
		const dense = sampleEffectParticles({
			stage: snowStage({ density: 1 }),
			timeSeconds: 0,
		});
		const sparse = sampleEffectParticles({
			stage: snowStage({ density: 0.2 }),
			timeSeconds: 0,
		});
		expect(dense.length).toBeGreaterThan(sparse.length);
	});

	it("advances falling particles over time but twinkles stars in place", () => {
		const snow = snowStage();
		const snowStart = sampleEffectParticles({ stage: snow, timeSeconds: 0 });
		const snowLater = sampleEffectParticles({ stage: snow, timeSeconds: 2 });
		expect(snowLater[0].y).not.toBeCloseTo(snowStart[0].y, 5);

		const stars = snowStage({ variant: "stars" });
		const starStart = sampleEffectParticles({ stage: stars, timeSeconds: 0 });
		const starLater = sampleEffectParticles({ stage: stars, timeSeconds: 2 });
		// Stars hold position (only opacity twinkles).
		expect(starLater[0].y).toBeCloseTo(starStart[0].y, 5);
	});
});
