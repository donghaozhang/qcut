/**
 * Unit tests for VideoGeneratorAdapter's registry-based routing.
 *
 * Verifies the fix from
 * docs/task/gmi-provider/vimax-video-adapter-gmi-fix.md — that
 * video_model keys are resolved via ModelRegistry, routed to the
 * correct backend (fal vs gmi), and that unknown keys fail fast
 * instead of silently falling back to Kling on FAL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildImageField,
	resolveVideoModelSpec,
} from "../native-pipeline/vimax/adapters/video-adapter.js";
import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import type { ModelDefinitionInput } from "../native-pipeline/infra/registry.js";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Registry fixtures
// ---------------------------------------------------------------------------

const FAL_FIXTURE: ModelDefinitionInput = {
	key: "kling_2_1",
	name: "Kling 2.1",
	provider: "Kuaishou",
	endpoint: "fal-ai/kling-video/v2.1/standard/image-to-video",
	categories: ["image_to_video"],
	description: "Kling 2.1 i2v via FAL",
	pricing: 0.03,
	providerBackend: "fal",
};

const GMI_FIXTURE: ModelDefinitionInput = {
	key: "gmi_kling_v3_i2v",
	name: "Kling V3 I2V (GMI)",
	provider: "Kling (via GMI)",
	endpoint: "kling-v3-image-to-video",
	categories: ["image_to_video"],
	description: "Kling V3 image-to-video via GMI",
	pricing: { no_sound: 0.168, with_sound: 0.252 },
	providerBackend: "gmi",
};

const GMI_SINGLE_PRICE: ModelDefinitionInput = {
	key: "gmi_veo31_lite_i2v",
	name: "Veo 3.1 Lite I2V (GMI)",
	provider: "Google (via GMI)",
	endpoint: "veo-3.1-lite-i2v",
	categories: ["image_to_video"],
	description: "Veo 3.1 Lite image-to-video via GMI",
	pricing: 0.08,
	providerBackend: "gmi",
};

/** Register a fixture and return a cleanup function. */
function registerOnce(input: ModelDefinitionInput): () => void {
	if (ModelRegistry.has(input.key)) {
		// Registry is a module-level singleton — assume fixtures already loaded
		// by production code. No cleanup required.
		return () => {
			/* noop */
		};
	}
	ModelRegistry.register(input);
	return () => {
		// There is no public `unregister` — tests that register fresh fixtures
		// should use unique keys. If we ever add one, call it here.
	};
}

// ---------------------------------------------------------------------------
// resolveVideoModelSpec
// ---------------------------------------------------------------------------

describe("resolveVideoModelSpec", () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length) {
			const fn = cleanups.pop();
			fn?.();
		}
	});

	it("resolves a registered FAL model to provider=fal", () => {
		cleanups.push(registerOnce(FAL_FIXTURE));
		const spec = resolveVideoModelSpec("kling_2_1");
		expect(spec.canonicalKey).toBe("kling_2_1");
		expect(spec.providerBackend).toBe("fal");
		expect(spec.endpoint).toBe(
			"fal-ai/kling-video/v2.1/standard/image-to-video"
		);
		expect(spec.costPerSecond).toBe(0.03);
	});

	it("resolves a registered GMI model to provider=gmi", () => {
		cleanups.push(registerOnce(GMI_FIXTURE));
		const spec = resolveVideoModelSpec("gmi_kling_v3_i2v");
		expect(spec.canonicalKey).toBe("gmi_kling_v3_i2v");
		expect(spec.providerBackend).toBe("gmi");
		expect(spec.endpoint).toBe("kling-v3-image-to-video");
		// Object pricing — picks the minimum numeric value
		expect(spec.costPerSecond).toBe(0.168);
	});

	it("resolves a GMI model with scalar pricing", () => {
		cleanups.push(registerOnce(GMI_SINGLE_PRICE));
		const spec = resolveVideoModelSpec("gmi_veo31_lite_i2v");
		expect(spec.providerBackend).toBe("gmi");
		expect(spec.costPerSecond).toBe(0.08);
	});

	it("aliases legacy 'kling' to 'kling_2_1' (still routes to FAL)", () => {
		cleanups.push(registerOnce(FAL_FIXTURE));
		const spec = resolveVideoModelSpec("kling");
		expect(spec.canonicalKey).toBe("kling_2_1");
		expect(spec.providerBackend).toBe("fal");
	});

	it("throws a useful error for unknown model keys (no silent fallback)", () => {
		expect(() => resolveVideoModelSpec("totally_made_up_model")).toThrow(
			/Unknown video model "totally_made_up_model"/
		);
	});

	it("throws errors mention the `qcut system models` hint", () => {
		expect(() => resolveVideoModelSpec("bogus_key")).toThrow(
			/qcut system models --category image_to_video/
		);
	});
});

// ---------------------------------------------------------------------------
// Smoke test — VideoGeneratorAdapter.getAvailableModels includes registry keys
// ---------------------------------------------------------------------------

describe("VideoGeneratorAdapter.getAvailableModels", () => {
	it("includes registered image_to_video keys plus legacy aliases", async () => {
		// Register the actual production i2v catalogue so the test reflects
		// runtime behaviour (registry is a module-level singleton).
		const { registerImageToVideoModels } = await import(
			"../native-pipeline/registry-data/image-to-video.js"
		);
		registerImageToVideoModels();

		const { VideoGeneratorAdapter } = await import(
			"../native-pipeline/vimax/adapters/video-adapter.js"
		);
		const models = VideoGeneratorAdapter.getAvailableModels();
		// The production catalogue has >20 i2v models; assert a modest floor
		// so the test survives future registry re-orgs.
		expect(models.length).toBeGreaterThan(10);
		// Legacy alias is still accepted
		expect(models).toContain("kling");
		// Registry keys are surfaced — both FAL and GMI providers represented
		expect(models.some((k: string) => k.startsWith("gmi_"))).toBe(true);
		expect(models).toContain("kling_2_1");
	});
});

// ---------------------------------------------------------------------------
// buildImageField — provider-specific payload shape
// ---------------------------------------------------------------------------

describe("buildImageField", () => {
	const workdir = mkdtempSync(join(tmpdir(), "vimax-video-adapter-"));
	const pngBytes = Buffer.from(
		// 1x1 transparent PNG
		"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
			"0000000d49444154789c636040000000ffff03000006000557bffc820000000049454e44ae426082",
		"hex"
	);
	const localPng = join(workdir, "frame.png");
	writeFileSync(localPng, pngBytes);
	afterEach(() => {
		/* workdir cleaned by OS */
	});

	it("FAL + remote URL → image_url passthrough", () => {
		const out = buildImageField("https://cdn.example.com/frame.png", "fal");
		expect(out).toEqual({
			image_url: "https://cdn.example.com/frame.png",
		});
	});

	it("GMI + remote URL → image passthrough (renamed field)", () => {
		const out = buildImageField("https://cdn.example.com/frame.png", "gmi");
		expect(out).toEqual({ image: "https://cdn.example.com/frame.png" });
		expect(out).not.toHaveProperty("image_url");
	});

	it("FAL + local path → image_url as data URI", () => {
		const out = buildImageField(localPng, "fal");
		expect(out.image_url).toMatch(/^data:image\/png;base64,/);
		expect(out.image_url.length).toBeGreaterThan(50);
	});

	it("GMI + local path → image as RAW base64 (no data URI prefix)", () => {
		const out = buildImageField(localPng, "gmi");
		expect(out.image).not.toMatch(/^data:/);
		// Pure base64 — verify it's valid and decodes to the PNG bytes.
		const decoded = Buffer.from(out.image, "base64");
		expect(decoded).toEqual(pngBytes);
	});

	it("FAL + data URI stays untouched (pass-through)", () => {
		const dataUri = "data:image/png;base64,iVBORw0KGgo=";
		const out = buildImageField(dataUri, "fal");
		expect(out).toEqual({ image_url: dataUri });
	});

	it("GMI + data URI stays untouched (caller's responsibility)", () => {
		const dataUri = "data:image/png;base64,iVBORw0KGgo=";
		const out = buildImageField(dataUri, "gmi");
		expect(out).toEqual({ image: dataUri });
	});
});
