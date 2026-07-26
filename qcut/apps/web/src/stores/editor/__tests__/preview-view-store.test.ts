import { beforeEach, describe, expect, it } from "vitest";
import {
	SCOPE_DOCK_MAX_HEIGHT,
	SCOPE_DOCK_MIN_HEIGHT,
	usePreviewViewStore,
} from "../preview-view-store";

describe("preview view store", () => {
	beforeEach(() => {
		usePreviewViewStore.setState({
			previewScale: "fit",
			showSafeAreas: false,
			showRulers: false,
			scopesEnabled: false,
			scopeDockHeight: 180,
			visibleScopes: {
				parade: true,
				waveform: true,
				vectorscope: true,
				histogram: false,
			},
		});
	});

	it("steps preview zoom through the numeric presets and stops at the ends", () => {
		const store = usePreviewViewStore.getState();
		store.stepPreviewScale("in");
		expect(usePreviewViewStore.getState().previewScale).toBe(75);
		store.stepPreviewScale("out");
		expect(usePreviewViewStore.getState().previewScale).toBe(75);
		usePreviewViewStore.setState({ previewScale: 150 });
		store.stepPreviewScale("in");
		expect(usePreviewViewStore.getState().previewScale).toBe(150);
	});

	it("enters the preset list from fit at the nearest end", () => {
		usePreviewViewStore.getState().stepPreviewScale("out");
		expect(usePreviewViewStore.getState().previewScale).toBe(150);
	});

	it("toggles individual scopes independently", () => {
		usePreviewViewStore.getState().toggleScope("histogram");
		usePreviewViewStore.getState().toggleScope("parade");
		const { visibleScopes } = usePreviewViewStore.getState();
		expect(visibleScopes.histogram).toBe(true);
		expect(visibleScopes.parade).toBe(false);
		expect(visibleScopes.waveform).toBe(true);
	});

	it("clamps the scope dock height", () => {
		usePreviewViewStore.getState().setScopeDockHeight(5000);
		expect(usePreviewViewStore.getState().scopeDockHeight).toBe(
			SCOPE_DOCK_MAX_HEIGHT
		);
		usePreviewViewStore.getState().setScopeDockHeight(0);
		expect(usePreviewViewStore.getState().scopeDockHeight).toBe(
			SCOPE_DOCK_MIN_HEIGHT
		);
	});
});
