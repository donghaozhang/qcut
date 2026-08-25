import { describe, expect, it } from "vitest";
import { portraitPreviewSourceKey } from "../portrait-preview-source-key";

describe("portraitPreviewSourceKey", () => {
	it("stays stable when Electron recreates a blob URL", () => {
		const first = portraitPreviewSourceKey({
			elementId: "element-1",
			mediaId: "media-1",
			sourceSessionId: "session-1",
			sourceLocation: "blob:app://first",
			sourceSelector: 'img[data-color-source="true"]',
		});
		const second = portraitPreviewSourceKey({
			elementId: "element-1",
			mediaId: "media-1",
			sourceSessionId: "session-1",
			sourceLocation: "blob:app://second",
			sourceSelector: 'img[data-color-source="true"]',
		});
		expect(second).toBe(first);
	});

	it("changes when the timeline element or source media changes", () => {
		const baseline = portraitPreviewSourceKey({
			elementId: "element-1",
			mediaId: "media-1",
			sourceSessionId: "session-1",
			sourceLocation: "blob:app://source",
			sourceSelector: 'img[data-color-source="true"]',
		});
		expect(
			portraitPreviewSourceKey({
				elementId: "element-2",
				mediaId: "media-1",
				sourceSessionId: "session-1",
				sourceLocation: "blob:app://source",
				sourceSelector: 'img[data-color-source="true"]',
			})
		).not.toBe(baseline);
		expect(
			portraitPreviewSourceKey({
				elementId: "element-1",
				mediaId: "media-2",
				sourceSessionId: "session-1",
				sourceLocation: "blob:app://source",
				sourceSelector: 'img[data-color-source="true"]',
			})
		).not.toBe(baseline);
	});

	it("changes after the preview element is mounted again", () => {
		const baseline = portraitPreviewSourceKey({
			elementId: "element-1",
			mediaId: "media-1",
			sourceSessionId: "session-1",
			sourceLocation: "blob:app://source",
			sourceSelector: 'img[data-color-source="true"]',
		});
		expect(
			portraitPreviewSourceKey({
				elementId: "element-1",
				mediaId: "media-1",
				sourceSessionId: "session-2",
				sourceLocation: "blob:app://source",
				sourceSelector: 'img[data-color-source="true"]',
			})
		).not.toBe(baseline);
	});
});
