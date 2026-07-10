import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWriteFile = vi.fn();

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({ files: { writeFile: mockWriteFile } }),
}));

import { saveCaptions } from "../caption-export";

describe("saveCaptions native output", () => {
	beforeEach(() => {
		mockWriteFile.mockReset();
	});

	it("writes generated SRT content to the selected Electron sidecar path", async () => {
		let savedData: ArrayBuffer | null = null;
		mockWriteFile.mockImplementation(
			async (_path: string, data: ArrayBuffer) => {
				savedData = data;
				return true;
			}
		);

		const result = await saveCaptions(
			[
				{
					id: 1,
					seek: 0,
					start: 0,
					end: 1.5,
					text: "Native subtitle",
					tokens: [],
					temperature: 0,
					avg_logprob: 0,
					compression_ratio: 1,
					no_speech_prob: 0,
				},
			],
			"srt",
			"demo",
			{},
			"/tmp/exports/demo.srt"
		);

		expect(result).toEqual({
			success: true,
			filePath: "/tmp/exports/demo.srt",
		});
		expect(mockWriteFile).toHaveBeenCalledWith(
			"/tmp/exports/demo.srt",
			expect.any(ArrayBuffer)
		);
		expect(new TextDecoder().decode(savedData!)).toContain(
			"00:00:00,000 --> 00:00:01,500\nNative subtitle"
		);
	});
});
