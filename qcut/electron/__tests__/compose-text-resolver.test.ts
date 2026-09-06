import { describe, expect, it, vi } from "vitest";
import { resolveComposeText } from "../native-pipeline/compose/compose-text-resolver";
import type { ComposeAddCaptionOperation } from "../native-pipeline/compose/compose-protocol";

const caption: ComposeAddCaptionOperation = {
	id: "caption",
	kind: "add-caption",
	startTime: 0,
	duration: 3,
	text: "Hello",
	language: "en",
};

describe("Compose text bindings", () => {
	it("binds native styles and animations without mutating the catalog", async () => {
		const runtimeReference = {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "InfoSticker",
			resourceId: "template-resource",
			packageHash: "hash",
			templateDuration: 3,
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
		};
		const text = vi.fn().mockResolvedValue({
			styles: {
				styles: [
					{
						styleId: "template",
						compatibility: "native-runtime",
						runtimeReference,
					},
				],
			},
			animations: {
				animations: [
					{
						animationId: "animation",
						resourceId: "anim-resource",
						packageHash: "anim-hash",
						slot: "entrance",
						duration: 8,
					},
				],
			},
		});
		const result = await resolveComposeText({
			operation: {
				...caption,
				asset: {
					provider: "local",
					assetType: "text-template",
					assetId: "template",
				},
				textAnimation: {
					provider: "local",
					assetType: "text-animation",
					assetId: "animation",
				},
			},
			dependencies: { text, fonts: vi.fn(), readFont: vi.fn() },
		});
		expect(result.properties.jianyingTextStyle).toMatchObject({
			resourceId: "template-resource",
			animations: { entrance: { packageHash: "anim-hash", duration: 3 } },
		});
		expect(runtimeReference).not.toHaveProperty("animations");
	});
	it("does not silently flatten an unsupported native animation", async () => {
		await expect(
			resolveComposeText({
				operation: {
					...caption,
					textAnimation: {
						provider: "local",
						assetType: "text-animation",
						assetId: "animation",
					},
				},
				dependencies: {
					fonts: vi.fn(),
					readFont: vi.fn(),
					text: vi.fn().mockResolvedValue({
						styles: { styles: [] },
						animations: { animations: [] },
					}),
				},
			})
		).rejects.toThrow("requires a runtime text template");
	});
	it("resolves subtitle presets and fails unknown styles", async () => {
		const result = await resolveComposeText({
			operation: { ...caption, stylePresetId: "cinematic" },
		});
		expect(result.captionStyle?.fontFamily).toBe("Georgia");
		expect(result.richCaption).toBe(false);
		await expect(
			resolveComposeText({
				operation: { ...caption, stylePresetId: "missing" },
			})
		).rejects.toThrow("Unknown preset");
	});
	it("keeps built-in template identities for renderer resolution", async () => {
		const result = await resolveComposeText({
			operation: { ...caption, textTemplateId: "social-hook" },
		});
		expect(result).toMatchObject({
			richCaption: true,
			properties: { textTemplateId: "social-hook" },
		});
	});
	it("resolves font bytes before carrying a durable local font reference", async () => {
		const font = {
			fontId: "sha256:abc",
			cssFamily: "QCutLocal_abc",
			familyName: "Family",
			fullName: "Family Regular",
			postscriptName: "Family-Regular",
			subfamilyName: "Regular",
			format: "ttf" as const,
			size: 10,
			sourceKinds: [],
			filePaths: ["/private/font.ttf"],
			sha256: "abc",
		};
		const readFont = vi.fn().mockResolvedValue(Buffer.from("font"));
		const result = await resolveComposeText({
			operation: {
				...caption,
				font: { provider: "local", assetType: "font", assetId: font.fontId },
			},
			dependencies: {
				fonts: vi.fn().mockResolvedValue({ entries: [font] }),
				text: vi.fn(),
				readFont,
			},
		});
		expect(readFont).toHaveBeenCalledWith({ entry: font });
		expect(result.properties.fontAsset).toMatchObject({
			assetId: font.fontId,
			cssFamily: font.cssFamily,
		});
		expect(JSON.stringify(result)).not.toContain("/private");
	});
});
