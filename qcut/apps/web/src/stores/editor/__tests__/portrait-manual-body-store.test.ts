import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePortraitManualBodyStore } from "../portrait-manual-body-store";

const initialBody = {
	stretch: { intensity: 20, upper: 0.6, bottom: 0.2 },
};
const editedBody = {
	stretch: { intensity: 40, upper: 0.7, bottom: 0.15 },
};

describe("portrait manual body history", () => {
	beforeEach(() => {
		usePortraitManualBodyStore.setState({
			active: false,
			elementId: null,
			tool: "stretch",
			manualBody: {},
			past: [],
			future: [],
			interactionStartValue: null,
			bindings: null,
		});
	});

	it("records an entire drag as one undo step", () => {
		const onChange = vi.fn();
		const onInteractionStart = vi.fn();
		const onInteractionEnd = vi.fn();
		const store = usePortraitManualBodyStore.getState();
		store.syncValue({ elementId: "clip-1", manualBody: initialBody });
		store.setBindings({
			bindings: { onChange, onInteractionStart, onInteractionEnd },
		});
		usePortraitManualBodyStore.getState().beginInteraction();
		usePortraitManualBodyStore
			.getState()
			.updateManualBody({ manualBody: editedBody });
		usePortraitManualBodyStore.getState().finishInteraction();

		expect(usePortraitManualBodyStore.getState().past).toEqual([initialBody]);
		expect(onChange).toHaveBeenCalledWith(editedBody);
		expect(onInteractionStart).toHaveBeenCalledTimes(1);
		expect(onInteractionEnd).toHaveBeenCalledTimes(1);
	});

	it("undoes and redoes timeline data", () => {
		const onChange = vi.fn();
		const store = usePortraitManualBodyStore.getState();
		store.syncValue({ elementId: "clip-1", manualBody: initialBody });
		store.setBindings({
			bindings: {
				onChange,
				onInteractionStart: vi.fn(),
				onInteractionEnd: vi.fn(),
			},
		});
		usePortraitManualBodyStore
			.getState()
			.applyManualBody({ manualBody: editedBody });
		usePortraitManualBodyStore.getState().undo();
		expect(usePortraitManualBodyStore.getState().manualBody).toEqual(
			initialBody
		);
		usePortraitManualBodyStore.getState().redo();
		expect(usePortraitManualBodyStore.getState().manualBody).toEqual(
			editedBody
		);
		expect(onChange).toHaveBeenLastCalledWith(editedBody);
	});

	it("resets history when a different timeline element is selected", () => {
		const store = usePortraitManualBodyStore.getState();
		store.syncValue({ elementId: "clip-1", manualBody: initialBody });
		store.setBindings({
			bindings: {
				onChange: vi.fn(),
				onInteractionStart: vi.fn(),
				onInteractionEnd: vi.fn(),
			},
		});
		usePortraitManualBodyStore
			.getState()
			.applyManualBody({ manualBody: editedBody });
		usePortraitManualBodyStore
			.getState()
			.syncValue({ elementId: "clip-2", manualBody: {} });

		expect(usePortraitManualBodyStore.getState().past).toEqual([]);
		expect(usePortraitManualBodyStore.getState().future).toEqual([]);
		expect(usePortraitManualBodyStore.getState().elementId).toBe("clip-2");
	});
});
