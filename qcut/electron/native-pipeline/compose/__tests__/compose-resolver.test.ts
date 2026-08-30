import { describe, expect, it } from "vitest";
import { parseComposeManifest } from "../compose-manifest";
import {
	resolveComposeProject,
	type ComposeResolverDependencies,
} from "../compose-resolver";

const identity = { sha256: "a".repeat(64), bytes: 10 };

function dependencies(): ComposeResolverDependencies {
	return {
		inspectAsset: async () => identity,
		exportCatalog: async () => ({ count: 0, cards: [] }),
		resolveFilterPlan: async () => {
			throw new Error("unexpected filter");
		},
		probeMedia: async ({ filePath }) =>
			filePath.endsWith(".wav")
				? {
						duration: 1,
						width: 0,
						height: 0,
						frameRate: 0,
						hasVideo: false,
						hasAudio: true,
					}
				: {
						duration: 2,
						width: 640,
						height: 360,
						frameRate: 24,
						hasVideo: true,
						hasAudio: true,
					},
	};
}

function loaded({ value }: { value: unknown }) {
	return {
		configPath: "/tmp/edit.json",
		configDirectory: "/tmp",
		manifest: parseComposeManifest({ value }),
	};
}

describe("compose resolver", () => {
	it("locks adjacent transitions and timeline-bound overlays", async () => {
		const resolved = await resolveComposeProject({
			loaded: loaded({
				value: {
					schemaVersion: 1,
					clips: [
						{ id: "a", source: "a.mp4" },
						{ id: "b", source: "b.mp4" },
					],
					transitions: [
						{ between: ["a", "b"], preset: "crossfade", duration: 0.5 },
					],
					overlays: [
						{
							type: "sticker",
							source: "badge.png",
							start: 0.5,
							duration: 1,
						},
					],
					audio: [
						{
							type: "sound-effect",
							source: "pop.wav",
							start: 2,
							trim: { in: 0, out: 0.5 },
						},
					],
				},
			}),
			signal: new AbortController().signal,
			dependencies: dependencies(),
		});

		expect(resolved.duration).toBe(3.5);
		expect(resolved.transitionsByCut[0]?.between).toEqual(["a", "b"]);
		expect(resolved.lock.assets).toHaveLength(4);
	});

	it("rejects a transition that skips a clip", async () => {
		await expect(
			resolveComposeProject({
				loaded: loaded({
					value: {
						schemaVersion: 1,
						clips: [
							{ id: "a", source: "a.mp4" },
							{ id: "b", source: "b.mp4" },
							{ id: "c", source: "c.mp4" },
						],
						transitions: [
							{
								between: ["a", "c"],
								preset: "crossfade",
								duration: 0.5,
							},
						],
					},
				}),
				signal: new AbortController().signal,
				dependencies: dependencies(),
			})
		).rejects.toThrow(/adjacent clips/);
	});

	it("rejects a sticker that is completely outside the canvas", async () => {
		await expect(
			resolveComposeProject({
				loaded: loaded({
					value: {
						schemaVersion: 1,
						clips: [{ id: "a", source: "a.mp4" }],
						overlays: [
							{
								type: "sticker",
								source: "badge.png",
								start: 0,
								duration: 1,
								transform: { x: 1, y: 0, scale: 0.2 },
							},
						],
					},
				}),
				signal: new AbortController().signal,
				dependencies: dependencies(),
			})
		).rejects.toThrow(/outside the canvas/);
	});
});
