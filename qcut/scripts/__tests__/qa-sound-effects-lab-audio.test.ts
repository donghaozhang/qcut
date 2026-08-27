import { describe, expect, it } from "vitest";
import { parseAudioLoudness } from "../qa-sound-effects-lab-audio";

describe("Sound Effects Lab audio QA", () => {
	it("parses the final EBU R128 integrated loudness and true peak", () => {
		const output = `
Integrated loudness:
  I:         -70.0 LUFS
True peak:
  Peak:      -18.0 dBFS
Integrated loudness:
  I:         -22.0 LUFS
True peak:
  Peak:       -8.3 dBFS
[Parsed_volumedetect_1] max_volume: -8.5 dB
`;

		expect(parseAudioLoudness({ text: output })).toEqual({
			integratedLufs: -22,
			truePeakDbfs: -8.3,
			maxVolumeDb: -8.5,
		});
	});

	it("represents silent measurements as null", () => {
		expect(
			parseAudioLoudness({
				text: "I: -inf LUFS\nPeak: -inf dBFS\nmax_volume: -inf dB",
			})
		).toEqual({
			integratedLufs: null,
			truePeakDbfs: null,
			maxVolumeDb: null,
		});
	});
});
