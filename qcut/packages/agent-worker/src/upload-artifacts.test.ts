import { describe, expect, it } from "vitest";
import { classify } from "./upload-artifacts";

describe("classify (artifact ext → kind)", () => {
	for (const [ext, kind] of [
		[".png", "image"],
		[".webp", "image"],
		[".mp4", "video"],
		[".webm", "video"],
		[".wav", "audio"],
		[".mp3", "audio"],
		[".json", "json"],
		[".log", "log"],
		[".unknown", "log"],
	] as const) {
		it(`maps ${ext} → ${kind}`, () => {
			expect(classify(`file${ext}`)).toBe(kind);
		});
	}

	it("returns log for extensionless files", () => {
		expect(classify("README")).toBe("log");
	});
});
