import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import { downloadSelectedMediaItems } from "../use-media-actions";

function createMediaItem({
	id,
	metadata,
}: {
	id: string;
	metadata?: MediaItem["metadata"];
}): MediaItem {
	return {
		file: new File([id], `${id}.gif`, { type: "image/gif" }),
		id,
		metadata,
		name: `${id}.gif`,
		type: "image",
		url: `blob:${id}`,
	};
}

describe("raw media download restricted export policy", () => {
	it("blocks the entire selection before clicking a download link", () => {
		const click = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => undefined);

		expect(() =>
			downloadSelectedMediaItems({
				items: [
					createMediaItem({ id: "public" }),
					createMediaItem({
						id: "restricted",
						metadata: { redistribution: "prohibited" },
					}),
				],
			})
		).toThrow("QCUT_RESTRICTED_MEDIA_EXPORT");
		expect(click).not.toHaveBeenCalled();
	});
});
