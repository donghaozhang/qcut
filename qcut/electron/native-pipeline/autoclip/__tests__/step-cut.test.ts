import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "../steps/step-cut";

describe("sanitizeFilename", () => {
	it("removes illegal characters", () => {
		expect(sanitizeFilename('file<>:"|?*name')).toBe("file_______name");
	});

	it("removes backslash and forward slash", () => {
		expect(sanitizeFilename("path/to\\file")).toBe("path_to_file");
	});

	it("strips leading/trailing dots and spaces", () => {
		expect(sanitizeFilename("...hello...")).toBe("hello");
		expect(sanitizeFilename("  hello  ")).toBe("hello");
	});

	it("limits length to 100 characters", () => {
		const long = "a".repeat(200);
		expect(sanitizeFilename(long)).toHaveLength(100);
	});

	it("returns 'untitled' for empty result", () => {
		expect(sanitizeFilename("...")).toBe("untitled");
		expect(sanitizeFilename("<>:")).toBe("___");
	});

	it("handles normal filenames unchanged", () => {
		expect(sanitizeFilename("my-video-clip")).toBe("my-video-clip");
		expect(sanitizeFilename("Topic About AI")).toBe("Topic About AI");
	});
});
