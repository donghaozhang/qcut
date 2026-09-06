import { describe, expect, it } from "vitest";
import { createImpulse } from "../browser-audio-export";

/**
 * `createImpulse` is only safe to cache because its noise generator is seeded
 * with a fixed constant that is reset on every call. These tests pin that
 * property, so the cache can never silently start returning a buffer that
 * differs from what a rebuild would have produced.
 */

const SAMPLE_RATE = 48_000;

function fakeContext(sampleRate = SAMPLE_RATE): OfflineAudioContext {
	return {
		createBuffer: (channels: number, length: number, rate: number) => {
			const data = Array.from(
				{ length: channels },
				() => new Float32Array(length)
			);
			return {
				duration: length / rate,
				getChannelData: (channel: number) => data[channel],
				length,
				numberOfChannels: channels,
				sampleRate: rate,
			} as unknown as AudioBuffer;
		},
		sampleRate,
	} as unknown as OfflineAudioContext;
}

function samplesOf(buffer: AudioBuffer): number[] {
	return Array.from(buffer.getChannelData(0));
}

describe("createImpulse", () => {
	it("produces byte-identical samples for repeated uncached calls", () => {
		const context = fakeContext();
		const first = createImpulse({ context, damping: 50, roomSize: 50 });
		const second = createImpulse({ context, damping: 50, roomSize: 50 });

		expect(first).not.toBe(second);
		expect(samplesOf(second)).toEqual(samplesOf(first));
		expect(Array.from(second.getChannelData(1))).toEqual(
			Array.from(first.getChannelData(1))
		);
	});

	it("returns a cached buffer identical to an uncached rebuild", () => {
		const context = fakeContext();
		const uncached = createImpulse({ context, damping: 40, roomSize: 70 });

		const cache = new Map<string, AudioBuffer>();
		const built = createImpulse({ cache, context, damping: 40, roomSize: 70 });
		const reused = createImpulse({ cache, context, damping: 40, roomSize: 70 });

		expect(reused).toBe(built);
		expect(samplesOf(built)).toEqual(samplesOf(uncached));
		expect(cache.size).toBe(1);
	});

	it("keeps distinct entries per reverb setting", () => {
		const context = fakeContext();
		const cache = new Map<string, AudioBuffer>();

		const roomA = createImpulse({ cache, context, damping: 50, roomSize: 20 });
		const roomB = createImpulse({ cache, context, damping: 50, roomSize: 80 });
		const dampA = createImpulse({ cache, context, damping: 10, roomSize: 20 });

		expect(cache.size).toBe(3);
		expect(roomA).not.toBe(roomB);
		expect(roomA.length).not.toBe(roomB.length);
		// Same room size but different damping: same length, different envelope.
		expect(dampA.length).toBe(roomA.length);
		expect(samplesOf(dampA)).not.toEqual(samplesOf(roomA));
	});

	it("does not let one setting's buffer satisfy another setting", () => {
		const context = fakeContext();
		const cache = new Map<string, AudioBuffer>();

		createImpulse({ cache, context, damping: 50, roomSize: 50 });
		const other = createImpulse({ cache, context, damping: 50, roomSize: 51 });
		const rebuilt = createImpulse({ context, damping: 50, roomSize: 51 });

		expect(samplesOf(other)).toEqual(samplesOf(rebuilt));
	});

	it("scales buffer length with room size and sample rate", () => {
		const small = createImpulse({
			context: fakeContext(),
			damping: 50,
			roomSize: 0,
		});
		const large = createImpulse({
			context: fakeContext(),
			damping: 50,
			roomSize: 100,
		});
		const halfRate = createImpulse({
			context: fakeContext(24_000),
			damping: 50,
			roomSize: 100,
		});

		expect(small.length).toBe(Math.round(SAMPLE_RATE * 0.25));
		expect(large.length).toBe(Math.round(SAMPLE_RATE * 3));
		expect(halfRate.length).toBe(Math.round(24_000 * 3));
	});
});
