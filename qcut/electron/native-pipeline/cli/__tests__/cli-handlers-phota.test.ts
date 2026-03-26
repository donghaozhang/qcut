import { describe, it, expect, vi } from "vitest";
import {
	handlePhotaEdit,
	handlePhotaEnhance,
	handlePhotaCreateProfile,
} from "../cli-handlers-phota";
import type { CLIRunOptions } from "../cli-runner/types";

const noop = () => {};
const noopProgress = () => noop;
const signal = new AbortController().signal;

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		outputDir: "/tmp/test-phota",
		...overrides,
	} as CLIRunOptions;
}

describe("handlePhotaEdit", () => {
	it("returns error when --text is missing", async () => {
		const result = await handlePhotaEdit(
			makeOptions({ input: "photo.jpg" }),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--text");
	});

	it("returns error when --input is missing", async () => {
		const result = await handlePhotaEdit(
			makeOptions({ text: "make it blue" }),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("returns error when input file does not exist", async () => {
		const result = await handlePhotaEdit(
			makeOptions({
				text: "make it blue",
				input: "/nonexistent/photo.jpg",
			}),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});
});

describe("handlePhotaEnhance", () => {
	it("returns error when --input is missing", async () => {
		const result = await handlePhotaEnhance(makeOptions(), noop as any, signal);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("returns error when input file does not exist", async () => {
		const result = await handlePhotaEnhance(
			makeOptions({ input: "/nonexistent/photo.jpg" }),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});
});

describe("handlePhotaCreateProfile", () => {
	it("returns error when --input is missing", async () => {
		const result = await handlePhotaCreateProfile(
			makeOptions(),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("returns error when ZIP file does not exist", async () => {
		const result = await handlePhotaCreateProfile(
			makeOptions({ input: "/nonexistent/photos.zip" }),
			noop as any,
			signal
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});
});
