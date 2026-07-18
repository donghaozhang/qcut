import type {
	EffectInstance,
	MediaElement,
	TimelineTrack,
} from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import { extractEffectCompanionAudioSources } from "../effect-companion-audio-sources";

function mediaElement({
	id,
	startTime,
	duration,
	hidden = false,
}: {
	id: string;
	startTime: number;
	duration: number;
	hidden?: boolean;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `media-${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		hidden,
	};
}

function companionEffect({
	id,
	resourceId = "-2003",
	offsetSeconds = 0,
	durationSeconds = 1.6,
	gain = 0.9,
	enabled = true,
}: {
	id: string;
	resourceId?: string;
	offsetSeconds?: number;
	durationSeconds?: number;
	gain?: number;
	enabled?: boolean;
}): EffectInstance {
	return {
		id,
		name: id,
		effectType: "motion",
		parameters: {},
		audioCompanion: {
			resourceId,
			offsetSeconds,
			durationSeconds,
			gain,
		},
		duration: 0,
		enabled,
	};
}

describe("extractEffectCompanionAudioSources", () => {
	it("materializes a shared sound once and schedules every enabled effect", async () => {
		const track: TimelineTrack = {
			id: "track-1",
			name: "Video",
			type: "media",
			elements: [
				mediaElement({ id: "clip-a", startTime: 2, duration: 5 }),
				mediaElement({ id: "clip-b", startTime: 8, duration: 0.75 }),
			],
		};
		const ensureSourceResource = vi.fn(async () => [
			{
				cacheKey: "sound-cache-key",
				fromCache: true,
				role: "source" as const,
				sourceUrl: "/audio/builtin/cinematic-impact.ogg",
				url: "blob:sound",
				blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }),
			},
		]);
		const saveTemp = vi.fn(async () => "/tmp/effect-audio--2003.ogg");

		const result = await extractEffectCompanionAudioSources({
			tracks: [track],
			fps: 30,
			effectsByElementId: new Map([
				[
					"clip-a",
					[
						companionEffect({ id: "effect-a", offsetSeconds: 0.25 }),
						companionEffect({ id: "effect-disabled", enabled: false }),
					],
				],
				["clip-b", [companionEffect({ id: "effect-b" })]],
			]),
			api: { saveTemp },
			ensureSourceResource,
		});

		expect(ensureSourceResource).toHaveBeenCalledTimes(1);
		expect(saveTemp).toHaveBeenCalledTimes(1);
		expect(saveTemp).toHaveBeenCalledWith(
			expect.any(Uint8Array),
			"effect-audio--2003.ogg"
		);
		expect(result).toEqual([
			{
				elementId: "effect-a",
				trackId: "track-1",
				path: "/tmp/effect-audio--2003.ogg",
				startTime: 2.25,
				volume: 0.9,
				trimStart: 0,
				trimEnd: 0,
				duration: 1.6,
			},
			{
				elementId: "effect-b",
				trackId: "track-1",
				path: "/tmp/effect-audio--2003.ogg",
				startTime: 8,
				volume: 0.9,
				trimStart: 0,
				trimEnd: 0,
				duration: 0.75,
			},
		]);
	});

	it("skips muted, hidden, silent, and out-of-range companions", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "muted-track",
				name: "Muted",
				type: "media",
				muted: true,
				elements: [mediaElement({ id: "muted", startTime: 0, duration: 2 })],
			},
			{
				id: "visible-track",
				name: "Visible",
				type: "media",
				elements: [
					mediaElement({
						id: "hidden",
						startTime: 0,
						duration: 2,
						hidden: true,
					}),
					mediaElement({ id: "silent", startTime: 0, duration: 2 }),
					mediaElement({ id: "late", startTime: 0, duration: 1 }),
				],
			},
		];
		const saveTemp = vi.fn();
		const ensureSourceResource = vi.fn();

		const result = await extractEffectCompanionAudioSources({
			tracks,
			fps: 30,
			effectsByElementId: new Map([
				["muted", [companionEffect({ id: "muted-effect" })]],
				["hidden", [companionEffect({ id: "hidden-effect" })]],
				["silent", [companionEffect({ id: "silent-effect", gain: 0 })]],
				["late", [companionEffect({ id: "late-effect", offsetSeconds: 1.1 })]],
			]),
			api: { saveTemp },
			ensureSourceResource,
		});

		expect(result).toEqual([]);
		expect(ensureSourceResource).not.toHaveBeenCalled();
		expect(saveTemp).not.toHaveBeenCalled();
	});

	it("fails loudly when cached bytes are unavailable", async () => {
		const track: TimelineTrack = {
			id: "track-1",
			name: "Video",
			type: "media",
			elements: [mediaElement({ id: "clip-a", startTime: 0, duration: 2 })],
		};

		await expect(
			extractEffectCompanionAudioSources({
				tracks: [track],
				fps: 30,
				effectsByElementId: new Map([
					["clip-a", [companionEffect({ id: "effect-a" })]],
				]),
				api: { saveTemp: vi.fn() },
				ensureSourceResource: async () => [
					{
						cacheKey: "missing-blob",
						fromCache: true,
						role: "source",
						sourceUrl: "/audio/builtin/cinematic-impact.ogg",
						url: "/audio/builtin/cinematic-impact.ogg",
					},
				],
			})
		).rejects.toThrow("has no exportable bytes");
	});

	it("caps companions to the speed-aware media timeline duration", async () => {
		const element = mediaElement({ id: "clip-a", startTime: 2, duration: 10 });
		element.trimStart = 1;
		element.trimEnd = 1;
		element.playbackRate = 2;
		element.freezeFrameDuration = 1;
		const track: TimelineTrack = {
			id: "track-1",
			name: "Video",
			type: "media",
			elements: [element],
		};

		const result = await extractEffectCompanionAudioSources({
			tracks: [track],
			fps: 30,
			effectsByElementId: new Map([
				[
					"clip-a",
					[
						companionEffect({
							id: "effect-a",
							offsetSeconds: 1,
							durationSeconds: 10,
						}),
					],
				],
			]),
			api: { saveTemp: vi.fn(async () => "/tmp/effect.ogg") },
			ensureSourceResource: async () => [
				{
					cacheKey: "sound",
					fromCache: true,
					role: "source",
					sourceUrl: "/effect.ogg",
					url: "blob:sound",
					blob: new Blob([new Uint8Array([1])]),
				},
			],
		});

		expect(result[0]).toMatchObject({ startTime: 3, duration: 4 });
	});
});
