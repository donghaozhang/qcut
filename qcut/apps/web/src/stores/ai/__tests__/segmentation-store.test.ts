import { beforeEach, describe, expect, it } from "vitest";
import { useSegmentationStore } from "../segmentation-store";

describe("segmentation tracking requests", () => {
	beforeEach(() => useSegmentationStore.getState().resetStore());

	it("keeps the target mask, anchor frame, and tracking direction together", () => {
		useSegmentationStore.getState().setTrackingRequest({
			requestId: "request-1",
			elementId: "clip-1",
			maskId: "mask-2",
			direction: "backward",
			anchorFrame: 42,
		});
		expect(useSegmentationStore.getState().trackingRequest).toEqual({
			requestId: "request-1",
			elementId: "clip-1",
			maskId: "mask-2",
			direction: "backward",
			anchorFrame: 42,
		});

		useSegmentationStore.getState().clearTrackingRequest();
		expect(useSegmentationStore.getState().trackingRequest).toBeNull();
	});
});
