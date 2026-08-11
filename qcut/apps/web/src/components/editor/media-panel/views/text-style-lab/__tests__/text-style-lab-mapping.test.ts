import { describe, expect, it } from "vitest";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";
import {
	buildTextStyleLabElement,
	buildTextStyleLabUpdates,
} from "../text-style-lab-mapping";

function createStyle({
	compatible = true,
}: {
	compatible?: boolean;
} = {}): JianyingTextStyleLabStyleSummary {
	return {
		styleId: `7405879107424111910/${"a".repeat(32)}`,
		resourceId: "7405879107424111910",
		version: "a".repeat(32),
		title: "黄色花字",
		categoryIds: ["yellow"],
		packageKind: "TextStyle",
		packageVersion: "3.0",
		fillKind: compatible ? "solid" : "texture",
		strokeCount: 1,
		innerShadowCount: 0,
		shadowCount: 1,
		textureLayerCount: compatible ? 0 : 1,
		hasCover: true,
		compatibility: compatible ? "flat-compatible" : "preview-only",
		...(compatible
			? {
					approximation: {
						version: 1 as const,
						color: "#ffcc00",
						strokeColor: "#111111",
						strokeWidth: 3,
						strokeOpacity: 1,
						shadowColor: "#333333",
						shadowOpacity: 0.8,
						shadowOffsetX: 4,
						shadowOffsetY: 4,
						shadowBlur: 0,
						glowColor: "#ffffff",
						glowOpacity: 0,
						glowBlur: 12,
					},
				}
			: {}),
	};
}

describe("text style lab mapping", () => {
	it("keeps the glyph background transparent in updates and new elements", () => {
		const style = createStyle();
		expect(buildTextStyleLabUpdates({ style })).toMatchObject({
			color: "#ffcc00",
			strokeWidth: 3,
			backgroundColor: "transparent",
			backgroundOpacity: 0,
		});
		expect(
			buildTextStyleLabElement({ style, content: "透明花字" })
		).toMatchObject({
			type: "text",
			content: "透明花字",
			backgroundColor: "transparent",
			backgroundOpacity: 0,
			fontSize: 72,
		});
	});

	it("does not pretend texture-only packages can be applied", () => {
		const style = createStyle({ compatible: false });
		expect(buildTextStyleLabUpdates({ style })).toBeNull();
		expect(buildTextStyleLabElement({ style })).toBeNull();
	});

	it("creates a stable timeline reference for native runtime packages", () => {
		const base = createStyle({ compatible: false });
		const runtimeReference = {
			schemaVersion: 1 as const,
			source: "jianying-cache" as const,
			packageKind: "ScriptInfoSticker" as const,
			resourceId: base.resourceId,
			packageHash: base.version,
			editMode: "runtime-with-preload-fallback" as const,
			slotMapping: "line-to-widget" as const,
			timeMapping: "stretch" as const,
			templateDuration: 3,
		};
		const style: JianyingTextStyleLabStyleSummary = {
			...base,
			packageKind: "ScriptInfoSticker",
			compatibility: "native-runtime",
			runtimeReference,
		};
		expect(buildTextStyleLabUpdates({ style })).toMatchObject({
			backgroundOpacity: 0,
			width: 1024,
			height: 512,
			jianyingTextStyle: runtimeReference,
		});
		expect(
			buildTextStyleLabElement({ style, content: "动态花字" })
		).toMatchObject({
			content: "动态花字",
			width: 1024,
			height: 512,
			jianyingTextStyle: runtimeReference,
		});
	});
});
