import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortraitManualRetouchStore } from "../portrait-manual-retouch-store";

describe("portrait manual retouch store", () => {
	beforeEach(() => {
		usePortraitManualRetouchStore.setState({
			active: false,
			tool: "smooth",
			mode: "paint",
			size: 50,
			intensity: 100,
			draft: null,
			commitHandler: null,
		});
	});

	it("clamps brush controls to Jianying boundaries", () => {
		const store = usePortraitManualRetouchStore.getState();
		store.setSize({ size: 0 });
		store.setIntensity({ intensity: -1 });
		expect(usePortraitManualRetouchStore.getState()).toMatchObject({
			size: 1,
			intensity: 0,
		});

		store.setSize({ size: 101 });
		store.setIntensity({ intensity: 101 });
		expect(usePortraitManualRetouchStore.getState()).toMatchObject({
			size: 100,
			intensity: 100,
		});
	});

	it("commits a zero-intensity click as a replayable two-point stroke", () => {
		const commitHandler = vi.fn();
		const store = usePortraitManualRetouchStore.getState();
		store.setCommitHandler({ handler: commitHandler });
		store.setIntensity({ intensity: 0 });
		store.beginStroke({ point: { x: 0.4, y: 0.3 }, faceTrackId: 2 });
		store.finishStroke();

		expect(commitHandler).toHaveBeenCalledOnce();
		expect(commitHandler.mock.calls[0]?.[0]).toMatchObject({
			tool: "smooth",
			mode: "paint",
			size: 50,
			intensity: 0,
			points: [
				{ x: 0.4, y: 0.3 },
				{ x: 0.4, y: 0.3 },
			],
			faceTrackId: 2,
		});
		expect(usePortraitManualRetouchStore.getState().draft).toBeNull();
	});
});
