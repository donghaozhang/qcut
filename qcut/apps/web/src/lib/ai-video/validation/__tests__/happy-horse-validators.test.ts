import { describe, expect, it } from "vitest";
import {
	HAPPY_HORSE_EDIT_MAX_INPUT_BYTES,
	isHappyHorseModel,
	isHappyHorseRef2VModel,
	isHappyHorseT2VModel,
	isHappyHorseVideoEditModel,
	validateHappyHorseAspectRatio,
	validateHappyHorseAudioSetting,
	validateHappyHorseDuration,
	validateHappyHorseImageUrls,
	validateHappyHorsePrompt,
	validateHappyHorseReferenceImages,
	validateHappyHorseResolution,
	validateHappyHorseSeed,
	validateHappyHorseVideoEditUrl,
} from "../validators/happy-horse-validators";

describe("isHappyHorseModel", () => {
	it("returns true for the three Happy Horse keys", () => {
		expect(isHappyHorseModel("happy_horse_t2v")).toBe(true);
		expect(isHappyHorseModel("happy_horse_ref2v")).toBe(true);
		expect(isHappyHorseModel("happy_horse_video_edit")).toBe(true);
	});

	it("returns false for unrelated keys", () => {
		expect(isHappyHorseModel("ltx23_pro_t2v")).toBe(false);
		expect(isHappyHorseModel("seedance2_ref2v")).toBe(false);
		expect(isHappyHorseModel("")).toBe(false);
	});

	it("variant guards are mutually exclusive", () => {
		expect(isHappyHorseT2VModel("happy_horse_t2v")).toBe(true);
		expect(isHappyHorseRef2VModel("happy_horse_t2v")).toBe(false);
		expect(isHappyHorseVideoEditModel("happy_horse_t2v")).toBe(false);

		expect(isHappyHorseT2VModel("happy_horse_ref2v")).toBe(false);
		expect(isHappyHorseRef2VModel("happy_horse_ref2v")).toBe(true);
		expect(isHappyHorseVideoEditModel("happy_horse_ref2v")).toBe(false);

		expect(isHappyHorseT2VModel("happy_horse_video_edit")).toBe(false);
		expect(isHappyHorseRef2VModel("happy_horse_video_edit")).toBe(false);
		expect(isHappyHorseVideoEditModel("happy_horse_video_edit")).toBe(true);
	});
});

describe("validateHappyHorseDuration", () => {
	it("accepts every integer in [3, 15]", () => {
		for (let d = 3; d <= 15; d++) {
			expect(() => validateHappyHorseDuration(d)).not.toThrow();
		}
	});

	it("accepts string forms of integers in [3, 15]", () => {
		expect(() => validateHappyHorseDuration("3")).not.toThrow();
		expect(() => validateHappyHorseDuration("15")).not.toThrow();
	});

	it("rejects values below 3", () => {
		expect(() => validateHappyHorseDuration(0)).toThrow();
		expect(() => validateHappyHorseDuration(2)).toThrow();
	});

	it("rejects values above 15", () => {
		expect(() => validateHappyHorseDuration(16)).toThrow();
		expect(() => validateHappyHorseDuration(60)).toThrow();
	});

	it("rejects non-integer numbers", () => {
		expect(() => validateHappyHorseDuration(5.5)).toThrow();
		expect(() => validateHappyHorseDuration(NaN)).toThrow();
	});
});

describe("validateHappyHorseResolution", () => {
	it("accepts 720p / 1080p", () => {
		expect(() => validateHappyHorseResolution("720p")).not.toThrow();
		expect(() => validateHappyHorseResolution("1080p")).not.toThrow();
	});

	it("rejects unsupported resolutions", () => {
		expect(() => validateHappyHorseResolution("480p")).toThrow();
		expect(() => validateHappyHorseResolution("4K")).toThrow();
		expect(() => validateHappyHorseResolution("")).toThrow();
	});
});

describe("validateHappyHorseAspectRatio", () => {
	it("accepts the five published aspect ratios", () => {
		for (const ar of ["16:9", "9:16", "1:1", "4:3", "3:4"]) {
			expect(() => validateHappyHorseAspectRatio(ar)).not.toThrow();
		}
	});

	it("rejects values outside the published set", () => {
		expect(() => validateHappyHorseAspectRatio("21:9")).toThrow();
		expect(() => validateHappyHorseAspectRatio("auto")).toThrow();
	});
});

describe("validateHappyHorseImageUrls", () => {
	it("accepts 1–9 entries", () => {
		expect(() => validateHappyHorseImageUrls(["https://a.png"])).not.toThrow();
		expect(() =>
			validateHappyHorseImageUrls(
				Array.from({ length: 9 }, (_, i) => `https://a${i}.png`)
			)
		).not.toThrow();
	});

	it("rejects 0 entries", () => {
		expect(() => validateHappyHorseImageUrls([])).toThrow();
	});

	it("rejects 10+ entries", () => {
		expect(() =>
			validateHappyHorseImageUrls(
				Array.from({ length: 10 }, (_, i) => `https://a${i}.png`)
			)
		).toThrow();
	});

	it("rejects empty strings inside the array", () => {
		expect(() => validateHappyHorseImageUrls(["https://a.png", ""])).toThrow();
	});

	it("rejects data URIs", () => {
		expect(() =>
			validateHappyHorseImageUrls(["data:image/png;base64,abc"])
		).toThrow(/data URIs are not supported/);
	});
});

describe("validateHappyHorseReferenceImages", () => {
	it("treats undefined / [] as valid (optional field)", () => {
		expect(() => validateHappyHorseReferenceImages(undefined)).not.toThrow();
		expect(() => validateHappyHorseReferenceImages([])).not.toThrow();
	});

	it("accepts up to 5 entries", () => {
		expect(() =>
			validateHappyHorseReferenceImages(
				Array.from({ length: 5 }, (_, i) => `https://r${i}.png`)
			)
		).not.toThrow();
	});

	it("rejects 6+ entries", () => {
		expect(() =>
			validateHappyHorseReferenceImages(
				Array.from({ length: 6 }, (_, i) => `https://r${i}.png`)
			)
		).toThrow();
	});

	it("rejects data URIs", () => {
		expect(() =>
			validateHappyHorseReferenceImages(["data:image/png;base64,abc"])
		).toThrow();
	});
});

describe("validateHappyHorseVideoEditUrl", () => {
	it("accepts an MP4 URL", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4")
		).not.toThrow();
	});

	it("accepts a MOV URL", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mov")
		).not.toThrow();
	});

	it("rejects MKV", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mkv")
		).toThrow();
	});

	it("rejects empty URL", () => {
		expect(() => validateHappyHorseVideoEditUrl("")).toThrow();
	});

	it("rejects data URIs", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("data:video/mp4;base64,abc")
		).toThrow();
	});

	it("enforces the 100 MB ceiling", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4", {
				sizeBytes: HAPPY_HORSE_EDIT_MAX_INPUT_BYTES + 1,
			})
		).toThrow();
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4", {
				sizeBytes: HAPPY_HORSE_EDIT_MAX_INPUT_BYTES,
			})
		).not.toThrow();
	});

	it("enforces the 3–60 s window when duration is known", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4", {
				durationSeconds: 2,
			})
		).toThrow();
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4", {
				durationSeconds: 61,
			})
		).toThrow();
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/source.mp4", {
				durationSeconds: 30,
			})
		).not.toThrow();
	});

	it("checks content-type when supplied", () => {
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/blob", {
				contentType: "video/x-matroska",
			})
		).toThrow();
		expect(() =>
			validateHappyHorseVideoEditUrl("https://example.com/blob", {
				contentType: "video/mp4",
			})
		).not.toThrow();
	});
});

describe("validateHappyHorseAudioSetting", () => {
	it("accepts auto and origin", () => {
		expect(() => validateHappyHorseAudioSetting("auto")).not.toThrow();
		expect(() => validateHappyHorseAudioSetting("origin")).not.toThrow();
	});

	it("rejects anything else", () => {
		expect(() => validateHappyHorseAudioSetting("on")).toThrow();
		expect(() => validateHappyHorseAudioSetting("off")).toThrow();
		expect(() => validateHappyHorseAudioSetting("")).toThrow();
	});
});

describe("validateHappyHorsePrompt", () => {
	it("accepts a normal prompt", () => {
		expect(() => validateHappyHorsePrompt("a cat")).not.toThrow();
	});

	it("rejects empty / whitespace-only prompts", () => {
		expect(() => validateHappyHorsePrompt("")).toThrow();
		expect(() => validateHappyHorsePrompt("   \n  ")).toThrow();
	});

	it("rejects > 2500 char prompts", () => {
		expect(() => validateHappyHorsePrompt("a".repeat(2501))).toThrow();
	});
});

describe("validateHappyHorseSeed", () => {
	it("accepts integers in [0, 2^31 - 1]", () => {
		expect(() => validateHappyHorseSeed(0)).not.toThrow();
		expect(() => validateHappyHorseSeed(2_147_483_647)).not.toThrow();
	});

	it("rejects negatives, floats, and NaN", () => {
		expect(() => validateHappyHorseSeed(-1)).toThrow();
		expect(() => validateHappyHorseSeed(1.5)).toThrow();
		expect(() => validateHappyHorseSeed(NaN)).toThrow();
	});

	it("rejects values past the int32 cap", () => {
		expect(() => validateHappyHorseSeed(2_147_483_648)).toThrow();
	});
});
