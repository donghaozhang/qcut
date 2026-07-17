import { describe, expect, it } from "vitest";
import { BUILT_IN_AUDIO } from "../audio-library-catalog";
import {
	parseAudioLibraryDrag,
	serializeAudioLibraryDrag,
} from "../audio-library-drag";

describe("audio library drag payload", () => {
	it("round-trips a validated catalog item", () => {
		const sound = BUILT_IN_AUDIO[0];
		const serialized = serializeAudioLibraryDrag({
			payload: { sound, kind: "music" },
		});
		expect(parseAudioLibraryDrag({ value: serialized })).toEqual({
			sound,
			kind: "music",
		});
	});

	it("rejects malformed payloads", () => {
		expect(parseAudioLibraryDrag({ value: "not-json" })).toBeNull();
		expect(
			parseAudioLibraryDrag({
				value: JSON.stringify({ kind: "video", sound: { id: "bad" } }),
			})
		).toBeNull();
	});
});
