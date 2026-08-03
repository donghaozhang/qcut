import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectThumbnailLoader } from "../use-project-thumbnail-loader";

const getProjectThumbnail = vi.hoisted(() => vi.fn());

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ getProjectThumbnail }),
	},
}));

describe("useProjectThumbnailLoader", () => {
	beforeEach(() => {
		getProjectThumbnail.mockReset();
		getProjectThumbnail.mockResolvedValue("blob:project-thumbnail");
	});

	it("keeps one loader identity while caching repeated reads", async () => {
		const { result, rerender } = renderHook(() => useProjectThumbnailLoader());
		const loader = result.current;

		await expect(loader("project-1")).resolves.toBe("blob:project-thumbnail");
		rerender();

		expect(result.current).toBe(loader);
		await expect(result.current("project-1")).resolves.toBe(
			"blob:project-thumbnail"
		);
		expect(getProjectThumbnail).toHaveBeenCalledTimes(1);
	});

	it("deduplicates concurrent reads and caches an empty thumbnail", async () => {
		getProjectThumbnail.mockResolvedValue(null);
		const { result } = renderHook(() => useProjectThumbnailLoader());

		let first: Promise<string | null>;
		let second: Promise<string | null>;
		act(() => {
			first = result.current("project-1");
			second = result.current("project-1");
		});

		await expect(first!).resolves.toBeNull();
		await expect(second!).resolves.toBeNull();
		await expect(result.current("project-1")).resolves.toBeNull();
		expect(getProjectThumbnail).toHaveBeenCalledTimes(1);
	});

	it("retries after a failed thumbnail read", async () => {
		getProjectThumbnail
			.mockRejectedValueOnce(new Error("IndexedDB unavailable"))
			.mockResolvedValueOnce("blob:recovered-thumbnail");
		const { result } = renderHook(() => useProjectThumbnailLoader());

		await expect(result.current("project-1")).rejects.toThrow(
			"IndexedDB unavailable"
		);
		await expect(result.current("project-1")).resolves.toBe(
			"blob:recovered-thumbnail"
		);
		expect(getProjectThumbnail).toHaveBeenCalledTimes(2);
	});
});
