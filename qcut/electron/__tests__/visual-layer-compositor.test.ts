import { describe, expect, it } from "vitest";
import {
	composePreparedVisualLayers,
	sortPreparedVisualLayers,
	type PreparedVisualLayer,
} from "../ffmpeg/visual-layer-compositor";

function layer({
	inputLabel,
	kind,
	trackOrder,
	elementOrder = 0,
	legacyOrder,
}: Pick<
	PreparedVisualLayer,
	"inputLabel" | "kind" | "trackOrder" | "legacyOrder"
> & { elementOrder?: number }): PreparedVisualLayer {
	return {
		inputLabel,
		kind,
		trackOrder,
		elementOrder,
		sourceOrder: 0,
		legacyOrder,
		blendMode: "normal",
	};
}

describe("visual layer compositor", () => {
	it("sorts every visual kind from lower timeline tracks to upper tracks", () => {
		const ordered = sortPreparedVisualLayers({
			layers: [
				layer({
					inputLabel: "title",
					kind: "text",
					trackOrder: 0,
					legacyOrder: 4,
				}),
				layer({
					inputLabel: "video",
					kind: "video",
					trackOrder: 3,
					legacyOrder: 0,
				}),
				layer({
					inputLabel: "sticker",
					kind: "sticker",
					trackOrder: 1,
					legacyOrder: 2,
				}),
				layer({
					inputLabel: "image",
					kind: "image",
					trackOrder: 2,
					legacyOrder: 1,
				}),
			],
		});

		expect(ordered.map(({ inputLabel }) => inputLabel)).toEqual([
			"video",
			"image",
			"sticker",
			"title",
		]);
	});

	it("builds the overlay chain in canonical order", () => {
		const result = composePreparedVisualLayers({
			baseLabel: "background",
			layers: [
				layer({
					inputLabel: "top_text",
					kind: "text",
					trackOrder: 0,
					legacyOrder: 4,
				}),
				layer({
					inputLabel: "bottom_video",
					kind: "video",
					trackOrder: 2,
					legacyOrder: 0,
				}),
				layer({
					inputLabel: "middle_image",
					kind: "image",
					trackOrder: 1,
					legacyOrder: 1,
				}),
			],
		});
		const graph = result.filterSteps.join(";");

		expect(graph.indexOf("[bottom_video]overlay")).toBeLessThan(
			graph.indexOf("[middle_image]overlay")
		);
		expect(graph.indexOf("[middle_image]overlay")).toBeLessThan(
			graph.indexOf("[top_text]overlay")
		);
		expect(result.outputLabel).toBe("visual_text_2_composite");
	});
});
