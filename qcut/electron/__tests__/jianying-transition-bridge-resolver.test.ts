// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES,
	jianyingTransitionBridgeCompilerArguments,
} from "../jianying-transition/bridge-resolver.js";

describe("Jianying transition bridge resolver", () => {
	it("links every probe dependency and required macOS framework", () => {
		const sourceDirectory = "/fixture/probe";
		const outputPath = "/fixture/bin/jianying-transition-bridge";
		const arguments_ = jianyingTransitionBridgeCompilerArguments({
			sourceDirectory,
			outputPath,
		});
		const compiledSources = JIANYING_TRANSITION_BRIDGE_SOURCE_FILE_NAMES.filter(
			(name) => name.endsWith(".mm") || name.endsWith(".cpp")
		).map((name) => path.join(sourceDirectory, name));

		expect(compiledSources).toEqual(
			expect.arrayContaining([
				path.join(sourceDirectory, "graphics-runtime.mm"),
				path.join(sourceDirectory, "filter-probe.mm"),
				path.join(sourceDirectory, "filter-sequence-io.cpp"),
				path.join(sourceDirectory, "text-probe.mm"),
				path.join(sourceDirectory, "text-resource-finder.mm"),
			])
		);
		expect(arguments_).toEqual(
			expect.arrayContaining([
				...compiledSources,
				"AppKit",
				"CoreVideo",
				"IOSurface",
				"OpenGL",
			])
		);
		expect(arguments_.slice(-2)).toEqual(["-o", outputPath]);
	});
});
