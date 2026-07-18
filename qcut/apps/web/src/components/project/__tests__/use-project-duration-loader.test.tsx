import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectDurationLoader } from "../use-project-duration-loader";

const getProjectDuration = vi.hoisted(() => vi.fn());

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ getProjectDuration }),
	},
}));

describe("useProjectDurationLoader", () => {
	beforeEach(() => {
		getProjectDuration.mockReset();
		getProjectDuration.mockResolvedValue(42);
	});

	it("deduplicates concurrent and repeated reads for one project", async () => {
		const { result, rerender } = renderHook(() => useProjectDurationLoader());

		let first: Promise<number | null>;
		let second: Promise<number | null>;
		act(() => {
			first = result.current("project-1");
			second = result.current("project-1");
		});

		await expect(first!).resolves.toBe(42);
		await expect(second!).resolves.toBe(42);
		rerender();
		await expect(result.current("project-1")).resolves.toBe(42);
		expect(getProjectDuration).toHaveBeenCalledTimes(1);
	});

	it("retries a project after a cached request rejects", async () => {
		getProjectDuration
			.mockRejectedValueOnce(new Error("IndexedDB unavailable"))
			.mockResolvedValueOnce(18);
		const { result } = renderHook(() => useProjectDurationLoader());

		await expect(result.current("project-1")).rejects.toThrow(
			"IndexedDB unavailable"
		);
		await expect(result.current("project-1")).resolves.toBe(18);
		expect(getProjectDuration).toHaveBeenCalledTimes(2);
	});
});
