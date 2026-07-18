import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useLocaleStore } from "@/stores/locale-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import EffectsView from "../effects";

vi.mock("@/config/features", () => ({
	EFFECTS_ENABLED: true,
	isFeatureEnabled: () => true,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

function addSelectedMediaClip(): string {
	const timeline = useTimelineStore.getState();
	const trackId = timeline.tracks[0].id;
	const elementId = timeline.addElementToTrack(trackId, {
		type: "media",
		mediaId: "media-1",
		name: "Clip",
		startTime: 0,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
	});
	if (!elementId) throw new Error("Failed to add media clip");
	timeline.setSelectedElements([{ trackId, elementId }]);
	return elementId;
}

describe("EffectsView", () => {
	beforeEach(() => {
		localStorage.clear();
		useLocaleStore.getState().setLocale({ locale: "en" });
		useTimelineStore.getState().clearTimeline();
		useEffectsStore.setState({
			activeEffects: new Map(),
			effectChains: new Map(),
			selectedCategory: "all",
			selectedEffect: null,
		});
		useMediaStore.setState({ mediaItems: [] });
	});

	afterEach(() => {
		clearAutoSaveTimer();
		vi.clearAllMocks();
	});

	it("renders the derived Popular collection with real image previews", () => {
		const { container } = render(<EffectsView />);

		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(12);
		expect(
			screen.getByTestId("effect-card-dynamic-camera-shake")
		).toBeVisible();
		expect(screen.getByTestId("effect-card-camera-push-in")).toBeVisible();
		const previews = container.querySelectorAll<HTMLImageElement>(
			'[data-testid^="effect-card-"] img[data-effect-preview-base="true"]'
		);
		expect(previews).toHaveLength(12);
		for (const preview of previews) {
			expect(preview.getAttribute("src")).toBe(
				"/images/filter-previews/coastal.webp"
			);
		}
		expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
	});

	it("filters by the new visual categories and searches the full catalog", () => {
		render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-navigation-dynamic"));
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(3);
		expect(
			screen.getByTestId("effect-card-dynamic-rhythm-pulse")
		).toBeVisible();

		fireEvent.change(screen.getByLabelText("Search effects"), {
			target: { value: "negative" },
		});
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(1);
		expect(screen.getByTestId("effect-card-invert")).toBeVisible();
	});

	it("renders three real multi-screen previews from composite programs", () => {
		const { container } = render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-navigation-multiscreen"));
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(3);
		expect(
			screen.getByTestId("effect-card-multiscreen-side-by-side")
		).toBeVisible();
		expect(
			container.querySelectorAll("canvas[data-effect-composite-layout]")
		).toHaveLength(3);
	});

	it("applies three paired sound effects with their persisted audio resource", () => {
		const elementId = addSelectedMediaClip();
		const { container } = render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-navigation-sound"));
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(3);
		expect(
			container.querySelectorAll("[data-effect-audio-companion]")
		).toHaveLength(3);
		fireEvent.click(screen.getByTestId("effect-card-sound-cinematic-impact"));

		expect(useEffectsStore.getState().getElementEffects(elementId)).toEqual([
			expect.objectContaining({
				presetId: "sound-cinematic-impact",
				audioCompanion: {
					resourceId: "-2003",
					offsetSeconds: 0,
					durationSeconds: 1.6,
					gain: 0.9,
				},
			}),
		]);
		const timelineElement = useTimelineStore
			.getState()
			.tracks.flatMap((track) => track.elements)
			.find((element) => element.id === elementId);
		expect(timelineElement?.effects?.[0]?.audioCompanion?.resourceId).toBe(
			"-2003"
		);
	});

	it("updates labels and search when the interface language changes", () => {
		render(<EffectsView />);

		expect(screen.getByText("Basic")).toBeVisible();
		expect(screen.getByText("Camera Shake")).toBeVisible();

		act(() => {
			useLocaleStore.getState().setLocale({ locale: "zh" });
		});

		expect(screen.getByText("画面特效")).toBeVisible();
		expect(screen.getByText("基础")).toBeVisible();
		expect(screen.getByText("震动镜头")).toBeVisible();

		fireEvent.change(screen.getByLabelText("搜索特效"), {
			target: { value: "提亮" },
		});
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(2);
		expect(screen.getByTestId("effect-card-brightness-increase")).toBeVisible();
		expect(screen.getByTestId("effect-card-basic-clean-bright")).toBeVisible();
	});

	it("derives Favorites from the same catalog entries", () => {
		render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-favorite-dynamic-camera-shake"));
		fireEvent.click(screen.getByTestId("effect-section-favorites"));

		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(1);
		expect(
			screen.getByTestId("effect-card-dynamic-camera-shake")
		).toBeVisible();
		expect(localStorage.setItem).toHaveBeenCalledWith(
			"effectsFavorites",
			JSON.stringify(["dynamic-camera-shake"])
		);
	});

	it("applies the same sepia parameters used by FFmpeg export", () => {
		const elementId = addSelectedMediaClip();
		render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-navigation-atmosphere"));
		fireEvent.click(screen.getByTestId("effect-card-sepia"));

		expect(useEffectsStore.getState().getElementEffects(elementId)).toEqual([
			expect.objectContaining({
				name: "Sepia",
				effectType: "sepia",
				parameters: { sepia: 80 },
				enabled: true,
			}),
		]);
		expect(
			useEffectsStore.getState().getFFmpegFilterChain(elementId)
		).toContain("colorchannelmixer=");
	});
});
