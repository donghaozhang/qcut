import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "../data-url";

describe("dataUrlToBlob", () => {
	it("decodes base64 data without a network request", async () => {
		const blob = dataUrlToBlob({
			dataUrl: "data:image/svg+xml;base64,PHN2ZyAvPg==",
		});

		expect(blob.type).toBe("image/svg+xml");
		expect(await blob.text()).toBe("<svg />");
	});

	it("decodes percent-encoded UTF-8 data", async () => {
		const svg = '<svg aria-label="热门" />';
		const blob = dataUrlToBlob({
			dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
		});

		expect(blob.type).toBe("image/svg+xml");
		expect(await blob.text()).toBe(svg);
	});

	it("rejects malformed data URLs", () => {
		expect(() =>
			dataUrlToBlob({ dataUrl: "https://example.com/a.svg" })
		).toThrow("Expected a data URL");
		expect(() => dataUrlToBlob({ dataUrl: "data:image/svg+xml" })).toThrow(
			"Invalid data URL"
		);
	});
});
