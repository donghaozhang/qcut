import { describe, expect, test } from "vitest";
import {
	downloadIconifyStickerSvg,
	iconifyStickerUrl,
	parseIconifyStickerId,
	searchIconifyStickers,
} from "../iconify-sticker-client";

describe("Iconify sticker client", () => {
	test("searches a collection and exposes attribution metadata", async () => {
		let requestedUrl = "";
		const response = await searchIconifyStickers({
			query: "detective",
			collection: "fluent-emoji",
			limit: 2,
			fetchImpl: async (input) => {
				requestedUrl = String(input);
				return new Response(
					JSON.stringify({
						icons: [
							"fluent-emoji:detective",
							"fluent-emoji:detective-light-skin-tone",
						],
						total: 2,
						collections: {
							"fluent-emoji": {
								name: "Fluent Emoji",
								license: {
									title: "MIT",
									spdx: "MIT",
									url: "https://opensource.org/license/mit",
								},
							},
						},
					}),
					{ status: 200 }
				);
			},
		});

		expect(requestedUrl).toContain("query=detective");
		expect(requestedUrl).toContain("prefixes=fluent-emoji");
		expect(response.results).toHaveLength(2);
		expect(response.results[0]).toMatchObject({
			id: "fluent-emoji:detective",
			name: "Detective",
			collectionName: "Fluent Emoji",
			license: { spdxId: "MIT" },
		});
		expect(response.results[0]?.previewUrl).toContain(
			"fluent-emoji:detective.svg"
		);
	});

	test("validates IDs and rejects non-SVG download responses", async () => {
		expect(
			parseIconifyStickerId({ stickerId: "fluent-emoji:warning" })
		).toEqual({ collection: "fluent-emoji", icon: "warning" });
		expect(() => parseIconifyStickerId({ stickerId: "not a sticker" })).toThrow(
			"Expected collection:icon"
		);
		expect(
			iconifyStickerUrl({ stickerId: "fluent-emoji:warning", size: 256 })
		).toContain("width=256");

		await expect(
			downloadIconifyStickerSvg({
				stickerId: "fluent-emoji:warning",
				fetchImpl: async () => new Response("not svg", { status: 200 }),
			})
		).rejects.toThrow("invalid SVG");
	});
});
