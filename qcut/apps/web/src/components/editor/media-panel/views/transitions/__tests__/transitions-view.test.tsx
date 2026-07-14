import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useMediaStore } from "@/stores/media/media-store";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { TransitionsView } from "../index";
import { getTransitionPresetById } from "../transition-presets";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

function mediaElement({
	id,
	name,
	mediaId,
	startTime,
	duration,
}: {
	id: string;
	name: string;
	mediaId: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		name,
		type: "media",
		mediaId,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function adjacentClipsTrack(): TimelineTrack {
	return {
		id: "track-1",
		name: "Media",
		type: "media",
		isMain: true,
		elements: [
			mediaElement({
				id: "clip-a",
				name: "Clip A",
				mediaId: "media-a",
				startTime: 0,
				duration: 4,
			}),
			mediaElement({
				id: "clip-b",
				name: "Clip B",
				mediaId: "media-b",
				startTime: 4,
				duration: 3,
			}),
		],
	};
}

function mediaItem({
	id,
	thumbnailUrl,
	type = "video",
}: {
	id: string;
	thumbnailUrl?: string;
	type?: MediaItem["type"];
}): MediaItem {
	return {
		id,
		name: `${id}.${type}`,
		type,
		file: new File([], `${id}.${type}`),
		thumbnailUrl,
	};
}

function selectAdjacentClips() {
	const track = adjacentClipsTrack();
	useMediaStore.setState({
		mediaItems: [mediaItem({ id: "media-a" }), mediaItem({ id: "media-b" })],
	});
	useTimelineStore.setState({
		_tracks: [track],
		tracks: [track],
		selectedElements: [
			{ trackId: "track-1", elementId: "clip-a" },
			{ trackId: "track-1", elementId: "clip-b" },
		],
	});
}

describe("TransitionsView", () => {
	beforeEach(() => {
		useTimelineStore.setState({
			selectedElements: [],
			_tracks: [],
			tracks: [],
			history: [],
			redoStack: [],
			selectedTransition: null,
		});
		useMediaStore.setState({ mediaItems: [] });
		useAssetLibraryStore.getState().resetLibrary();
	});

	afterEach(() => {
		clearAutoSaveTimer();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("renders transition presets instead of the old placeholder", () => {
		render(<TransitionsView />);

		expect(screen.getByTestId("transition-card-dissolve")).toBeInTheDocument();
		expect(
			screen.queryByText("Transitions view coming soon...")
		).not.toBeInTheDocument();
	});

	it("filters cards by search query", () => {
		render(<TransitionsView />);

		fireEvent.change(screen.getByLabelText("搜索转场"), {
			target: { value: "bright" },
		});

		expect(
			screen.getByTestId("transition-card-fade-to-white")
		).toBeInTheDocument();
		expect(
			screen.queryByTestId("transition-card-dissolve")
		).not.toBeInTheDocument();
	});

	it("switches categories", () => {
		render(<TransitionsView />);

		fireEvent.click(screen.getByRole("button", { name: "模糊" }));

		expect(
			screen.getByTestId("transition-card-soft-zoom-blur")
		).toBeInTheDocument();
		expect(screen.getByTestId("transition-card-zoom-blur")).toBeInTheDocument();
		expect(
			screen.queryByTestId("transition-card-wipe-left")
		).not.toBeInTheDocument();
	});

	it("exposes at least twenty working cards in every content category", () => {
		render(<TransitionsView />);

		for (const [category, presetId, expectedCount] of [
			["叠化", "filmic-dissolve", 20],
			["自然", "sunrise-fade", 20],
			["幻灯片", "album-slide-left", 20],
			["分割", "split-signal", 21],
			["模糊", "horizontal-smear", 20],
			["运镜", "crash-zoom", 20],
			["拍摄", "exposure-pop", 20],
			["扭曲", "digital-twist", 20],
			["光效", "prism-flare", 20],
			["故障", "data-mosh", 20],
			["综艺", "sticker-swipe", 20],
			["MG 动画", "kinetic-jump", 20],
			["互动 emoji", "love-flash", 20],
		] as const) {
			fireEvent.click(screen.getByRole("button", { name: category }));
			expect(screen.getByTestId(`transition-card-${presetId}`)).toBeVisible();
			expect(screen.getByText(`${expectedCount} 个转场`)).toBeVisible();
		}
	});

	it("shows the empty state when no presets match the search", () => {
		render(<TransitionsView />);

		fireEvent.change(screen.getByLabelText("搜索转场"), {
			target: { value: "zzzz-no-match" },
		});

		expect(screen.getByText("没有符合条件的转场")).toBeInTheDocument();
		expect(screen.getByText("0 个转场")).toBeInTheDocument();
	});

	it("falls back selection to the first visible preset when filtered out", () => {
		render(<TransitionsView />);

		fireEvent.change(screen.getByLabelText("搜索转场"), {
			target: { value: "bright" },
		});

		expect(screen.getByTestId("transition-card-fade-to-white")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("selects a card on click", () => {
		render(<TransitionsView />);

		fireEvent.click(screen.getByTestId("transition-card-wipe-left"));

		expect(screen.getByTestId("transition-card-wipe-left")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(screen.getByTestId("transition-card-dissolve")).toHaveAttribute(
			"aria-pressed",
			"false"
		);
	});

	it("persists transition favorites in the shared asset library", () => {
		render(<TransitionsView />);
		const dissolve = screen.getByTestId("transition-card-dissolve");
		fireEvent.click(within(dissolve).getByRole("button", { name: "收藏" }));
		fireEvent.click(screen.getByText("收藏").closest("button")!);

		expect(screen.getByTestId("transition-card-dissolve")).toBeInTheDocument();
		expect(
			screen.queryByTestId("transition-card-fade-to-black")
		).not.toBeInTheDocument();
		expect(
			useAssetLibraryStore.getState().isFavorite({
				kind: "transition",
				id: "dissolve",
			})
		).toBe(true);
	});

	it("downloads and unlocks a remote transition preset", async () => {
		const mockFetch = vi.fn(
			async () => new Response("preview", { status: 200 })
		);
		vi.stubGlobal("fetch", mockFetch);
		render(<TransitionsView />);
		fireEvent.change(screen.getByLabelText("搜索转场"), {
			target: { value: "Speed Trail" },
		});

		const card = screen.getByTestId("transition-card-speed-trail");
		expect(card).toHaveAttribute("draggable", "false");
		fireEvent.click(
			within(card).getByRole("button", { name: "下载转场素材: 高速轨迹" })
		);

		await waitFor(() => expect(card).toHaveAttribute("draggable", "true"));
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(
			Object.values(
				useAssetLibraryStore.getState().runtimeByAssetKey
			).some(
				(runtime) =>
					runtime.assetKey === "transition:speed-trail@1" &&
					runtime.downloadStatus === "downloaded" &&
					runtime.cacheStatus === "cached"
			)
		).toBe(true);
	});

	it("disables the apply button without a valid selection", () => {
		render(<TransitionsView />);

		expect(screen.getByRole("button", { name: "应用所选转场" })).toBeDisabled();
		expect(
			screen.getByText(
				"Select two adjacent video clips to prepare a transition."
			)
		).toBeInTheDocument();
	});

	it("applies the selected preset to the timeline from the footer button", () => {
		selectAdjacentClips();
		render(<TransitionsView />);

		expect(
			screen.getByText("Ready between Clip A and Clip B.")
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "应用所选转场" }));

		const track = useTimelineStore
			.getState()
			.tracks.find((item) => item.id === "track-1");
		expect(track?.transitions).toEqual([
			expect.objectContaining({
				fromElementId: "clip-a",
				toElementId: "clip-b",
				presetId: "dissolve",
				type: "dissolve",
				duration: 0.5,
				easing: "easeInOut",
			}),
		]);
		expect(toast.success).toHaveBeenCalledWith("Dissolve applied.");
	});

	it("disables transition application when either selected clip is an image", () => {
		selectAdjacentClips();
		useMediaStore.setState({
			mediaItems: [
				mediaItem({ id: "media-a" }),
				mediaItem({ id: "media-b", type: "image" }),
			],
		});
		render(<TransitionsView />);

		expect(screen.getByRole("button", { name: "应用所选转场" })).toBeDisabled();
		expect(
			screen.getByText("Transitions require two video clips.")
		).toBeInTheDocument();
	});

	it("applies a preset from the card apply button", () => {
		selectAdjacentClips();
		render(<TransitionsView />);

		fireEvent.click(screen.getByRole("button", { name: "应用黑场过渡" }));

		const track = useTimelineStore
			.getState()
			.tracks.find((item) => item.id === "track-1");
		expect(track?.transitions).toEqual([
			expect.objectContaining({
				presetId: "fade-to-black",
				type: "fade-black",
			}),
		]);
		expect(toast.success).toHaveBeenCalledWith("Fade Through Black applied.");
	});

	it("double-clicks a ready card to replace the transition at the seam", () => {
		selectAdjacentClips();
		render(<TransitionsView />);

		fireEvent.doubleClick(screen.getByTestId("transition-card-push-left"));

		const track = useTimelineStore
			.getState()
			.tracks.find((item) => item.id === "track-1");
		expect(track?.transitions).toEqual([
			expect.objectContaining({
				presetId: "push-left",
				type: "push",
				direction: "left",
			}),
		]);
	});

	it("shows an error toast when the store rejects the transition", () => {
		selectAdjacentClips();
		const originalAddTransition = useTimelineStore.getState().addTransition;
		const addTransition = vi.fn(() => null);
		useTimelineStore.setState({ addTransition });

		try {
			render(<TransitionsView />);
			fireEvent.click(screen.getByRole("button", { name: "应用所选转场" }));

			expect(addTransition).toHaveBeenCalledWith({
				trackId: "track-1",
				fromElementId: "clip-a",
				toElementId: "clip-b",
				videoMediaIds: new Set(["media-a", "media-b"]),
				presetId: "dissolve",
				type: "dissolve",
				direction: undefined,
				tuning: undefined,
				duration: 0.5,
				easing: "easeInOut",
			});
			expect(toast.error).toHaveBeenCalledWith(
				"This cut does not have enough room for a transition."
			);
			expect(toast.success).not.toHaveBeenCalled();
		} finally {
			useTimelineStore.setState({ addTransition: originalAddTransition });
		}
	});

	it("uses the selected clips' thumbnails for card previews", () => {
		selectAdjacentClips();
		useMediaStore.setState({
			mediaItems: [
				mediaItem({ id: "media-a", thumbnailUrl: "blob:thumb-a" }),
				mediaItem({ id: "media-b", thumbnailUrl: "blob:thumb-b" }),
			],
		});
		render(<TransitionsView />);

		const card = screen.getByTestId("transition-card-dissolve");
		const sources = Array.from(card.querySelectorAll("img")).map((img) =>
			img.getAttribute("src")
		);

		expect(sources).toEqual(["blob:thumb-a", "blob:thumb-b"]);
	});

	it("falls back to bundled preview art when no clips are selected", () => {
		render(<TransitionsView />);

		const card = screen.getByTestId("transition-card-dissolve");
		const sources = Array.from(card.querySelectorAll("img")).map((img) =>
			img.getAttribute("src")
		);
		const dissolve = getTransitionPresetById({ presetId: "dissolve" });

		expect(sources).toEqual([dissolve?.preview.from, dissolve?.preview.to]);
	});

	it("starts a drag with the encoded transition payload", () => {
		render(<TransitionsView />);
		const dataTransfer = {
			effectAllowed: "",
			setData: vi.fn(),
		};

		fireEvent.dragStart(screen.getByTestId("transition-card-slide-left"), {
			dataTransfer,
		});

		expect(dataTransfer.effectAllowed).toBe("copy");
		expect(dataTransfer.setData).toHaveBeenCalledWith(
			"text/plain",
			"Slide Left"
		);
		const payloadCall = dataTransfer.setData.mock.calls.find(
			([format]) => format === "application/qcut-transition"
		);
		expect(payloadCall).toBeDefined();
		expect(JSON.parse(payloadCall?.at(1) as string)).toEqual({
			kind: "qcut-transition-preset",
			id: "slide-left",
			type: "slide",
			direction: "left",
			defaultDuration: 0.45,
		});
	});
});
