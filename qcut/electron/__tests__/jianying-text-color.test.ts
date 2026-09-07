// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import { resolveJianyingTextBridgeEnvironment } from "../jianying-text-runtime/bridge-render.js";
import type { JianyingTextRuntimeRenderRequest } from "../jianying-text-runtime-contract.js";

const request: JianyingTextRuntimeRenderRequest = {
	requestId: "color-test",
	reference: {
		schemaVersion: 1,
		source: "jianying-cache",
		resourceId: "123",
		packageHash: "a".repeat(32),
		packageKind: "InfoSticker",
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	},
	content: "Title",
	fontSize: 72,
	canvasWidth: 1280,
	canvasHeight: 720,
	transform: { x: 0, y: 0, width: 960, height: 540, rotation: 0, opacity: 1 },
	sourceStart: 0.5,
	elementDuration: 3,
	frameCount: 1,
	fps: 30,
};
describe("native text color contract", () => {
	it.each([
		"red",
		"#abc",
		"#11223344",
		"112233",
		"#zzzzzz",
		12,
		null,
	])("rejects invalid color %s before invoking the runtime", async (textColor) => {
		await expect(
			renderJianyingText({
				request: { ...request, textColor: textColor as string },
			})
		).rejects.toThrow("six-digit hex");
	});
	it("does not silently ignore custom fill for script widgets", async () => {
		await expect(
			renderJianyingText({
				request: {
					...request,
					reference: { ...request.reference, packageKind: "ScriptInfoSticker" },
					textColor: "#047bff",
				},
			})
		).rejects.toThrow("ScriptInfoSticker");
	});
	it.each([
		undefined,
		"#047bff",
		"#ffbf17",
	])("isolates custom color %s from inherited environment", (textColor) => {
		const environment = resolveJianyingTextBridgeEnvironment({
			environment: { JY_TEXT_COLOR: "#ff0000" },
			runtimeRoot: "/runtime",
			request: {
				requestId: "color",
				packagePath: "/package",
				packageKind: "InfoSticker",
				content: "Title",
				outputPath: "/tmp/test.rgba",
				width: 960,
				height: 540,
				frameCount: 1,
				startTimestamp: 500000,
				timestampStep: 33333,
				timelineDuration: 3000000,
				textColor,
			},
		});
		expect(environment.JY_TEXT_COLOR).toBe(textColor ?? "");
	});
});
