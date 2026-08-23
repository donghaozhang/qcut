import { describe, expect, it, vi } from "vitest";
import { createUtilityTimelineMutationAccessor } from "../utility/utility-timeline-accessor";

describe("utility timeline mutation accessor", () => {
	it("forwards project identity for single placement", async () => {
		const requestFromMain = vi.fn(async () => undefined);
		const accessor = createUtilityTimelineMutationAccessor({ requestFromMain });

		await accessor.requestAddElement(
			"project-1",
			{ duration: 5, startTime: 0, type: "sticker" },
			"correlation-1"
		);

		expect(requestFromMain).toHaveBeenCalledWith("timeline:add-element", {
			correlationId: "correlation-1",
			element: { duration: 5, startTime: 0, type: "sticker" },
			projectId: "project-1",
		});
	});

	it("forwards project identity for batch placement", async () => {
		const response = {
			added: [{ elementId: "element-1", index: 0, success: true as const }],
			failedCount: 0,
		};
		const requestFromMain = vi.fn(async () => response);
		const accessor = createUtilityTimelineMutationAccessor({ requestFromMain });
		const elements = [
			{
				duration: 5,
				mediaId: "media-1",
				startTime: 0,
				trackId: "track-1",
				type: "media" as const,
			},
		];

		await expect(
			accessor.batchAddElements("project-1", elements, "correlation-2")
		).resolves.toEqual(response);
		expect(requestFromMain).toHaveBeenCalledWith("batch-add-elements", {
			correlationId: "correlation-2",
			elements,
			projectId: "project-1",
		});
	});
});
