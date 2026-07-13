import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import {
	getMediaUsageCounts,
	sortMediaLibraryItems,
} from "../media-library-view";

function media({
	id,
	name,
	type,
	duration,
	lastModified,
}: {
	id: string;
	name: string;
	type: MediaItem["type"];
	duration: number;
	lastModified: number;
}): MediaItem {
	return {
		id,
		name,
		type,
		duration,
		file: new File([id], name, { lastModified }),
	};
}

describe("media library view data", () => {
	const items = [
		media({
			id: "b",
			name: "Beta",
			type: "video",
			duration: 4,
			lastModified: 10,
		}),
		media({
			id: "a",
			name: "Alpha",
			type: "audio",
			duration: 8,
			lastModified: 20,
		}),
	];

	it("sorts without mutating the media store order", () => {
		expect(
			sortMediaLibraryItems({ items, sortBy: "name" }).map((item) => item.id)
		).toEqual(["a", "b"]);
		expect(
			sortMediaLibraryItems({ items, sortBy: "recent" }).map((item) => item.id)
		).toEqual(["a", "b"]);
		expect(
			sortMediaLibraryItems({ items, sortBy: "duration" }).map(
				(item) => item.id
			)
		).toEqual(["a", "b"]);
		expect(items.map((item) => item.id)).toEqual(["b", "a"]);
	});

	it("counts every timeline reference to a media item", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "media-track",
				name: "Media",
				type: "media",
				elements: [
					{
						id: "one",
						name: "One",
						type: "media",
						mediaId: "b",
						startTime: 0,
						duration: 1,
						trimStart: 0,
						trimEnd: 0,
					},
					{
						id: "two",
						name: "Two",
						type: "media",
						mediaId: "b",
						startTime: 1,
						duration: 1,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		];

		expect(getMediaUsageCounts({ tracks }).get("b")).toBe(2);
		expect(getMediaUsageCounts({ tracks }).has("a")).toBe(false);
	});
});
