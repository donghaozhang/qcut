import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJianyingFilterThumbnail } from "../use-jianying-filter-thumbnail";

function installThumbnailApi() {
	const thumbnail = vi.fn(async () => ({
		resourceId: "filter-1",
		mimeType: "image/png" as const,
		bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
	}));
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			...(window.electronAPI ?? {}),
			jianyingFilterLab: {
				list: vi.fn(),
				load: vi.fn(),
				thumbnail,
				onCatalogChanged: vi.fn(() => vi.fn()),
			},
		},
	});
	return thumbnail;
}

describe("useJianyingFilterThumbnail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("loads thumbnail bytes only after the card is eligible for display", async () => {
		const thumbnail = installThumbnailApi();
		const { result, unmount } = renderHook(() =>
			useJianyingFilterThumbnail({
				resourceId: "filter-1",
				hasThumbnail: true,
			})
		);

		await waitFor(() => expect(result.current.state).toBe("ready"));
		expect(thumbnail).toHaveBeenCalledWith({ resourceId: "filter-1" });
		expect(result.current.url).toBe("blob:mock-url");
		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
	});

	it("does not request a thumbnail for catalog rows without one", () => {
		const thumbnail = installThumbnailApi();
		const { result } = renderHook(() =>
			useJianyingFilterThumbnail({
				resourceId: "filter-1",
				hasThumbnail: false,
			})
		);

		expect(result.current.state).toBe("idle");
		expect(thumbnail).not.toHaveBeenCalled();
	});
});
