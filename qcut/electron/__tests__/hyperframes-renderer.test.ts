import { describe, expect, it } from "vitest";
import {
	buildHyperframesEncodeArgs,
	isAllowedHyperframesNavigation,
	resolveHyperframesRenderDuration,
	validateHyperframesRenderOptions,
} from "../hyperframes/renderer";

describe("buildHyperframesEncodeArgs", () => {
	it("encodes deterministic PNG frames with alpha", () => {
		const args = buildHyperframesEncodeArgs({
			framesPattern: "/tmp/frames/frame-%08d.png",
			outputPath: "/tmp/composition.mov",
			fps: 30,
		});

		expect(args).toContain("prores_ks");
		expect(args).toContain("yuva444p10le");
		expect(args).toContain("4");
		expect(args).toContain("/tmp/frames/frame-%08d.png");
		expect(args.at(-1)).toBe("/tmp/composition.mov");
	});
});

describe("resolveHyperframesRenderDuration", () => {
	it("prefers a valid runtime duration and falls back to imported metadata", () => {
		expect(
			resolveHyperframesRenderDuration({
				runtimeDuration: 12.5,
				fallbackDuration: 5,
			})
		).toBe(12.5);
		expect(
			resolveHyperframesRenderDuration({
				runtimeDuration: Number.NaN,
				fallbackDuration: 5,
			})
		).toBe(5);
	});

	it("rejects an unbounded runtime duration", () => {
		expect(() =>
			resolveHyperframesRenderDuration({
				runtimeDuration: 3601,
				fallbackDuration: 5,
			})
		).toThrow("exceeds 3600 seconds");
	});
});

describe("isAllowedHyperframesNavigation", () => {
	it("allows only the active composition document", () => {
		expect(
			isAllowedHyperframesNavigation({
				url: "qcut-hyperframes://token/index.html#frame",
				token: "token",
			})
		).toBe(true);
		expect(
			isAllowedHyperframesNavigation({
				url: "https://example.com/",
				token: "token",
			})
		).toBe(false);
		expect(
			isAllowedHyperframesNavigation({
				url: "qcut-hyperframes://other/index.html",
				token: "token",
			})
		).toBe(false);
	});
});

describe("validateHyperframesRenderOptions", () => {
	const validOptions = {
		renderId: "render-1",
		elementId: "element-1",
		sourcePath: "/tmp/composition.html",
		variables: { title: "Hello", count: 2, enabled: true },
		width: 1920,
		height: 1080,
		fps: 30,
		duration: 5,
	};

	it("accepts a bounded render request", () => {
		expect(() =>
			validateHyperframesRenderOptions({ options: validOptions })
		).not.toThrow();
	});

	it("rejects malformed variables and identifiers", () => {
		expect(() =>
			validateHyperframesRenderOptions({
				options: {
					...validOptions,
					renderId: "",
				},
			})
		).toThrow("render ID");
		expect(() =>
			validateHyperframesRenderOptions({
				options: {
					...validOptions,
					variables: { nested: {} },
				} as never,
			})
		).toThrow("scalar values");
		expect(() =>
			validateHyperframesRenderOptions({
				options: {
					...validOptions,
					variables: { count: Number.NaN },
				},
			})
		).toThrow("scalar values");
	});
});
