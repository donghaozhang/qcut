import { describe, expect, it } from "vitest";
import { parseComposeManifest } from "../compose-manifest";

describe("compose manifest", () => {
	it("applies deterministic defaults", () => {
		const manifest = parseComposeManifest({
			value: {
				schemaVersion: 1,
				clips: [{ id: "a", source: "a.mp4" }],
			},
		});

		expect(manifest).toMatchObject({
			canvas: { width: 1280, height: 720, fps: 30 },
			clips: [{ id: "a", trim: { in: 0 }, filters: [] }],
			transitions: [],
			overlays: [],
			audio: [],
		});
	});

	it("rejects duplicate clip ids and invalid trim windows", () => {
		expect(() =>
			parseComposeManifest({
				value: {
					schemaVersion: 1,
					clips: [
						{ id: "same", source: "a.mp4", trim: { in: 2, out: 1 } },
						{ id: "same", source: "b.mp4" },
					],
				},
			})
		).toThrow();
	});

	it("rejects sticker fades longer than the sticker", () => {
		expect(() =>
			parseComposeManifest({
				value: {
					schemaVersion: 1,
					clips: [{ id: "a", source: "a.mp4" }],
					overlays: [
						{
							type: "sticker",
							source: "badge.png",
							start: 0,
							duration: 1,
							fadeIn: 0.6,
							fadeOut: 0.6,
						},
					],
				},
			})
		).toThrow(/fadeIn \+ fadeOut/);
	});
});
