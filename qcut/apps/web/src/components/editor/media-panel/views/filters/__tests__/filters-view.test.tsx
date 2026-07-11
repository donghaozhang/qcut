import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	COLOR_PRESET_STORAGE_KEY,
	COLOR_PRESETS_CHANGED_EVENT,
	type SavedColorPreset,
} from "@/lib/color/color-presets";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { FILTER_FAVORITES_STORAGE_KEY } from "@/lib/filters/filter-favorites";
import { FILTER_PRESETS } from "@/lib/filters/filter-registry";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineStore } from "@/stores/timeline/types";
import type {
	MediaColorSettings,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { updateSelectedMediaColors } from "../filter-application";
import { FiltersView } from "../index";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../filter-application", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../filter-application")>();
	return {
		...actual,
		updateSelectedMediaColors: vi.fn(actual.updateSelectedMediaColors),
	};
});

function timelineTracks({
	color,
}: {
	color?: Partial<MediaColorSettings>;
} = {}): TimelineTrack[] {
	return [
		{
			id: "media-track",
			name: "Media",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "clip-1",
					type: "media",
					mediaId: "asset-1",
					name: "Clip 1",
					duration: 3,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
					color: color as MediaElement["color"],
				},
			],
		},
	];
}

/**
 * Installs timeline state with a mocked history and an updateMediaElement
 * fake that writes updates back into the store so the view re-renders with
 * fresh element colors — mirroring the real store behavior without autosave.
 */
function installTimelineState({
	tracks,
	selected,
}: {
	tracks: TimelineTrack[];
	selected: boolean;
}) {
	const pushHistory = vi.fn();
	const updateMediaElement = vi.fn(
		(trackId: string, elementId: string, updates: Partial<MediaElement>) => {
			const nextTracks: TimelineTrack[] = useTimelineStore
				.getState()
				._tracks.map((track) =>
					track.id === trackId
						? {
								...track,
								elements: track.elements.map((element) =>
									element.id === elementId
										? ({ ...element, ...updates } as typeof element)
										: element
								),
							}
						: track
				);
			useTimelineStore.setState({ _tracks: nextTracks, tracks: nextTracks });
		}
	);
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		selectedElements: selected
			? [{ trackId: "media-track", elementId: "clip-1" }]
			: [],
		pushHistory,
		updateMediaElement:
			updateMediaElement as unknown as TimelineStore["updateMediaElement"],
	});
	return { pushHistory, updateMediaElement };
}

/**
 * The shared test setup replaces window.localStorage with a no-op vi.fn()
 * mock; favorites and saved presets need real reads/writes, so install an
 * in-memory Storage per test.
 */
function createMemoryStorage(): Storage {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, String(value));
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
		key: (index: number) => [...store.keys()][index] ?? null,
		get length() {
			return store.size;
		},
	};
}

function savedPreset({
	id,
	name,
}: {
	id: string;
	name: string;
}): SavedColorPreset {
	return {
		id,
		name,
		createdAt: new Date().toISOString(),
		color: structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
	};
}

describe("FiltersView", () => {
	const originalLocalStorage = window.localStorage;

	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(window, "localStorage", {
			value: createMemoryStorage(),
			writable: true,
			configurable: true,
		});
		installTimelineState({ tracks: timelineTracks(), selected: false });
	});

	afterEach(() => {
		Object.defineProperty(window, "localStorage", {
			value: originalLocalStorage,
			writable: true,
			configurable: true,
		});
	});

	it("renders the library with the None card and full result count", () => {
		render(<FiltersView />);

		expect(screen.getByTestId("filter-card-none")).toBeInTheDocument();
		expect(screen.getByTestId("filter-card-vivid")).toBeInTheDocument();
		expect(
			screen.getByText(String(FILTER_PRESETS.length + 1))
		).toBeInTheDocument();
		expect(screen.getByText("Select a clip")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Select one or more image or video clips to apply a filter."
			)
		).toBeInTheDocument();
		expect(screen.getByTestId("filter-card-vivid")).toHaveAttribute(
			"aria-disabled",
			"true"
		);
	});

	it("does not apply a filter when no clip is selected", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-card-vivid"));

		expect(updateSelectedMediaColors).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("filters presets by search query and hides the None card", () => {
		render(<FiltersView />);

		fireEvent.change(screen.getByLabelText("Search filters"), {
			target: { value: "vivid" },
		});

		expect(screen.getByTestId("filter-card-vivid")).toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-clean")).not.toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-none")).not.toBeInTheDocument();
	});

	it("matches search queries against localized names", () => {
		render(<FiltersView />);

		fireEvent.change(screen.getByLabelText("Search filters"), {
			target: { value: "鲜明" },
		});

		expect(screen.getByTestId("filter-card-vivid")).toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-soft")).not.toBeInTheDocument();
	});

	it("shows the no-results empty state for an unmatched search", () => {
		render(<FiltersView />);

		fireEvent.change(screen.getByLabelText("Search filters"), {
			target: { value: "zzz-does-not-exist" },
		});

		expect(
			screen.getByText("No filters match this search.")
		).toBeInTheDocument();
	});

	it("switches categories from the sidebar", () => {
		render(<FiltersView />);

		// Only the sidebar entry shows 夏日 before the category is active.
		expect(screen.getAllByText("夏日")).toHaveLength(1);

		fireEvent.click(screen.getByTestId("filter-category-summer"));

		expect(screen.getByTestId("filter-category-summer")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		// Sidebar entry plus the results header now show the category label.
		expect(screen.getAllByText("夏日")).toHaveLength(2);
		expect(screen.getByTestId("filter-card-sunlight")).toBeInTheDocument();
		expect(screen.getByTestId("filter-card-coastal")).toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-clean")).not.toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-none")).not.toBeInTheDocument();
	});

	it("activates mode and category buttons from the keyboard", () => {
		render(<FiltersView />);

		fireEvent.keyDown(screen.getByTestId("filter-category-summer"), {
			key: "Enter",
		});

		expect(screen.getByTestId("filter-category-summer")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(screen.getByTestId("filter-card-sunlight")).toBeInTheDocument();

		fireEvent.keyDown(screen.getByRole("button", { name: "Favorites" }), {
			key: " ",
		});

		expect(screen.getByRole("button", { name: "Favorites" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(
			screen.getByText("Favorite filters appear here.")
		).toBeInTheDocument();
	});

	it("lists only new presets under the Latest category", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-latest"));

		expect(screen.getByTestId("filter-card-glow-portrait")).toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-clean")).not.toBeInTheDocument();
	});

	it("applies a preset to the selected clip and reflects it in the footer", () => {
		const { pushHistory, updateMediaElement } = installTimelineState({
			tracks: timelineTracks(),
			selected: true,
		});
		render(<FiltersView />);

		expect(screen.getByText("1 clip selected")).toBeInTheDocument();
		expect(
			screen.getByText("Choose a filter to adjust its intensity.")
		).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("filter-card-vivid"));

		expect(pushHistory).toHaveBeenCalledTimes(1);
		expect(updateMediaElement).toHaveBeenCalledWith(
			"media-track",
			"clip-1",
			expect.objectContaining({
				color: expect.objectContaining({
					enabled: true,
					filter: { presetId: "vivid", presetVersion: 1, intensity: 80 },
				}),
			}),
			false
		);
		expect(toast.success).toHaveBeenCalledWith("Applied Vivid");
		expect(screen.getByTestId("filter-card-vivid")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		// The card label plus the intensity footer both show the preset name.
		expect(screen.getAllByText("Vivid")).toHaveLength(2);
		expect(screen.getByText("80%")).toBeInTheDocument();
	});

	it("removes the active filter through the None card", () => {
		installTimelineState({
			tracks: timelineTracks({
				color: {
					filter: { presetId: "vivid", presetVersion: 1, intensity: 80 },
				},
			}),
			selected: true,
		});
		render(<FiltersView />);

		expect(screen.getByTestId("filter-card-vivid")).toHaveAttribute(
			"aria-pressed",
			"true"
		);

		fireEvent.click(screen.getByTestId("filter-card-none"));

		expect(toast.success).toHaveBeenCalledWith("Filter removed");
		expect(screen.getByTestId("filter-card-none")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(
			screen.getByText("Choose a filter to adjust its intensity.")
		).toBeInTheDocument();
	});

	it("shows a hint toast when no clip could be updated", () => {
		installTimelineState({ tracks: timelineTracks(), selected: true });
		vi.mocked(updateSelectedMediaColors).mockReturnValueOnce(0);
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-card-vivid"));

		expect(toast.info).toHaveBeenCalledWith(
			"Select an image or video clip first"
		);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("adjusts intensity from the slider with one undo checkpoint per interaction", () => {
		const { pushHistory, updateMediaElement } = installTimelineState({
			tracks: timelineTracks({
				color: {
					filter: { presetId: "vivid", presetVersion: 1, intensity: 40 },
				},
			}),
			selected: true,
		});
		render(<FiltersView />);

		expect(screen.getByText("40%")).toBeInTheDocument();

		fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

		expect(pushHistory).toHaveBeenCalledTimes(1);
		expect(updateMediaElement).toHaveBeenCalledWith(
			"media-track",
			"clip-1",
			expect.objectContaining({
				color: expect.objectContaining({
					filter: expect.objectContaining({ presetId: "vivid", intensity: 41 }),
				}),
			}),
			false
		);
		expect(screen.getByText("41%")).toBeInTheDocument();
	});

	it("toggles favorites and lists them in favorites mode", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByRole("button", { name: "Favorite Vivid" }));

		expect(
			JSON.parse(localStorage.getItem(FILTER_FAVORITES_STORAGE_KEY) ?? "[]")
		).toEqual(["vivid"]);

		fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

		expect(screen.getByTestId("filter-card-vivid")).toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-clean")).not.toBeInTheDocument();
		expect(screen.queryByTestId("filter-card-none")).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Remove Vivid from favorites" })
		);

		expect(
			screen.getByText("Favorite filters appear here.")
		).toBeInTheDocument();
		expect(
			JSON.parse(localStorage.getItem(FILTER_FAVORITES_STORAGE_KEY) ?? "[]")
		).toEqual([]);
	});

	it("resets the mine category when switching to favorites mode", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-mine"));
		fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

		expect(
			screen.queryByTestId("filter-category-mine")
		).not.toBeInTheDocument();
		expect(screen.getByTestId("filter-category-all")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("shows the empty state for the mine category without saved presets", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-mine"));

		expect(
			screen.getByText("Save a color preset to add it here.")
		).toBeInTheDocument();
	});

	it("applies saved color presets from the mine category", () => {
		localStorage.setItem(
			COLOR_PRESET_STORAGE_KEY,
			JSON.stringify([
				savedPreset({ id: "preset-1", name: "Sunset grade" }),
				savedPreset({ id: "preset-2", name: "Moody teal" }),
			])
		);
		const { updateMediaElement } = installTimelineState({
			tracks: timelineTracks(),
			selected: true,
		});
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-mine"));

		expect(screen.getByTestId("filter-card-preset-1")).toBeInTheDocument();
		expect(screen.getByTestId("filter-card-preset-2")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Search filters"), {
			target: { value: "sunset" },
		});

		expect(screen.getByTestId("filter-card-preset-1")).toBeInTheDocument();
		expect(
			screen.queryByTestId("filter-card-preset-2")
		).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId("filter-card-preset-1"));

		expect(updateMediaElement).toHaveBeenCalledWith(
			"media-track",
			"clip-1",
			expect.objectContaining({
				color: expect.objectContaining({
					filter: DEFAULT_MEDIA_COLOR_SETTINGS.filter,
				}),
			}),
			false
		);
		expect(toast.success).toHaveBeenCalledWith("Applied Sunset grade");
		expect(screen.getByTestId("filter-card-preset-1")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("shows a hint toast when a saved preset has no clip to update", () => {
		localStorage.setItem(
			COLOR_PRESET_STORAGE_KEY,
			JSON.stringify([savedPreset({ id: "preset-1", name: "Sunset grade" })])
		);
		installTimelineState({ tracks: timelineTracks(), selected: true });
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-mine"));
		vi.mocked(updateSelectedMediaColors).mockReturnValueOnce(0);
		fireEvent.click(screen.getByTestId("filter-card-preset-1"));

		expect(toast.info).toHaveBeenCalledWith(
			"Select an image or video clip first"
		);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("refreshes saved presets when the color presets event fires", () => {
		render(<FiltersView />);

		fireEvent.click(screen.getByTestId("filter-category-mine"));

		expect(
			screen.getByText("Save a color preset to add it here.")
		).toBeInTheDocument();

		act(() => {
			localStorage.setItem(
				COLOR_PRESET_STORAGE_KEY,
				JSON.stringify([savedPreset({ id: "preset-9", name: "Fresh look" })])
			);
			window.dispatchEvent(new Event(COLOR_PRESETS_CHANGED_EVENT));
		});

		expect(screen.getByTestId("filter-card-preset-9")).toBeInTheDocument();
	});
});
