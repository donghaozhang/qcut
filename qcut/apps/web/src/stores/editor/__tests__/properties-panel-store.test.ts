import { beforeEach, describe, expect, it } from "vitest";
import { usePropertiesPanelStore } from "../properties-panel-store";

describe("properties panel store", () => {
	beforeEach(() => {
		usePropertiesPanelStore.setState({
			activeAudioTab: "basic",
			audioRequest: undefined,
		});
	});

	it("remembers the active audio tab", () => {
		usePropertiesPanelStore.getState().setActiveAudioTab("effects");
		expect(usePropertiesPanelStore.getState().activeAudioTab).toBe("effects");
	});

	it("opens a requested tab and advances the request identity", () => {
		const store = usePropertiesPanelStore.getState();
		store.requestAudioPanel({
			elementId: "audio-1",
			tab: "voice",
			section: "separation",
		});
		const first = usePropertiesPanelStore.getState().audioRequest;
		expect(first).toMatchObject({
			elementId: "audio-1",
			tab: "voice",
			section: "separation",
		});

		usePropertiesPanelStore.getState().requestAudioPanel({
			elementId: "audio-1",
			tab: "voice",
			section: "separation",
		});
		expect(usePropertiesPanelStore.getState().audioRequest?.id).toBe(
			(first?.id ?? 0) + 1
		);
	});
});
