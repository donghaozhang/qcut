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

	it("renders 16 real image previews without unavailable cards", () => {
		const { container } = render(<EffectsView />);

		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(16);
		const previews = container.querySelectorAll<HTMLImageElement>(
			'[data-testid^="effect-card-"] img'
		);
		expect(previews).toHaveLength(16);
		for (const preview of previews) {
			expect(preview.getAttribute("src")).toBe(
				"/images/filter-previews/coastal.webp"
			);
			expect(preview.style.filter).not.toBe("");
		}
		expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
	});

	it("filters by category and query", () => {
		render(<EffectsView />);

		fireEvent.click(screen.getByTestId("effect-category-color"));
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(5);

		fireEvent.click(screen.getByTestId("effect-category-all"));
		fireEvent.change(screen.getByLabelText("Search effects"), {
			target: { value: "negative" },
		});
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(1);
		expect(screen.getByTestId("effect-card-invert")).toBeVisible();
	});

	it("updates labels and search when the interface language changes", () => {
		render(<EffectsView />);

		expect(screen.getByText("Basic")).toBeVisible();
		expect(screen.getByText("Brighten")).toBeVisible();

		act(() => {
			useLocaleStore.getState().setLocale({ locale: "zh" });
		});

		expect(screen.getByText("基础")).toBeVisible();
		expect(screen.getByText("提亮")).toBeVisible();
		expect(screen.getAllByText("可用")).toHaveLength(16);

		fireEvent.change(screen.getByLabelText("搜索特效"), {
			target: { value: "提亮" },
		});
		expect(screen.getAllByTestId(/^effect-card-/)).toHaveLength(1);
		expect(screen.getByTestId("effect-card-brightness-increase")).toBeVisible();
	});

	it("applies the same sepia parameters used by FFmpeg export", () => {
		const elementId = addSelectedMediaClip();
		render(<EffectsView />);

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
