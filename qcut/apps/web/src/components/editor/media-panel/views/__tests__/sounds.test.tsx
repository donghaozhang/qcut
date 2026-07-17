import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { AUDIO_LIBRARY_DRAG_MIME } from "@/lib/audio/audio-library-drag";
import { BUILT_IN_AUDIO } from "@/lib/audio/audio-library-catalog";
import { useLocaleStore } from "@/stores/locale-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { SoundsView } from "../sounds";

vi.mock("@/hooks/media/use-audio-library-search", () => ({
	useAudioLibrarySearch: () => ({
		results: [],
		isLoading: false,
		isLoadingMore: false,
		error: undefined,
		hasNextPage: false,
		totalCount: 0,
		loadMore: vi.fn(),
	}),
}));

vi.mock("@/hooks/media/use-audio-preview", () => ({
	useAudioPreview: () => ({
		playingId: null,
		playingSound: undefined,
		isPlaying: false,
		currentTime: 0,
		duration: 0,
		volume: 0.8,
		togglePreview: vi.fn(),
		seek: vi.fn(),
		setVolume: vi.fn(),
		stop: vi.fn(),
	}),
}));

vi.mock("../sounds-ai-voice", () => ({
	AIVoiceView: () => <div>AI voice view</div>,
}));

vi.mock("../sounds-ai-music", () => ({
	AiMusicView: () => <div>AI music view</div>,
}));

describe("SoundsView", () => {
	beforeEach(() => {
		localStorage.clear();
		useLocaleStore.getState().setLocale({ locale: "zh" });
		useMediaPanelStore.setState({ activeSoundsTab: "music-latest" });
		useSoundsStore.setState({
			savedSounds: [],
			recentSounds: [],
			audioFolders: [],
			isSavedSoundsLoaded: true,
		});
		useMediaStore.setState({ mediaItems: [] });
		useTimelineStore.setState({ _tracks: [], tracks: [] });
	});

	it("renders a no-key Chinese content home with bundled audio", () => {
		render(<SoundsView />);

		expect(screen.getByText("音乐库")).toBeVisible();
		expect(screen.getByText("音效库")).toBeVisible();
		expect(screen.getByText("静谧流光")).toBeVisible();
		expect(screen.getByText("霓虹节拍")).toBeVisible();
		expect(screen.getByText("凯旋")).toBeVisible();
		expect(screen.getByText("成就")).toBeVisible();
		expect(screen.getAllByText("1.3万").length).toBeGreaterThan(0);
		expect(screen.getAllByTitle("调性 E").length).toBeGreaterThan(0);
		expect(screen.getAllByTestId(/^audio-library-item-music-/)).toHaveLength(9);
	});

	it("filters bundled content by scene and Chinese search", () => {
		render(<SoundsView />);

		fireEvent.click(
			screen.getByRole("button", { name: "旅行", pressed: false })
		);
		expect(screen.getByText("向远方")).toBeVisible();
		expect(screen.queryByText("霓虹节拍")).not.toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("搜索音频库"), {
			target: { value: "治愈" },
		});
		expect(screen.getByText("静谧流光")).toBeVisible();
	});

	it("switches all library chrome to English", () => {
		render(<SoundsView />);

		act(() => {
			useLocaleStore.getState().setLocale({ locale: "en" });
		});

		expect(screen.getByText("Music library")).toBeVisible();
		expect(screen.getByText("Sound effects")).toBeVisible();
		expect(screen.getByText("Quiet Current")).toBeVisible();
		expect(
			screen.getByPlaceholderText("Search songs, artists, or sound effects")
		).toBeVisible();
	});

	it("publishes a compatible audio payload while dragging a card", () => {
		render(<SoundsView />);
		const card = screen.getAllByTestId(/^audio-library-item-music-/)[0];
		const setData = vi.fn();
		const dataTransfer = { effectAllowed: "none", setData };

		fireEvent.dragStart(card, { dataTransfer });

		expect(dataTransfer.effectAllowed).toBe("copy");
		expect(setData).toHaveBeenCalledWith(
			AUDIO_LIBRARY_DRAG_MIME,
			expect.stringContaining('"kind":"music"')
		);
		expect(setData).toHaveBeenCalledWith("text/plain", "高光定格");
		expect(card).toHaveClass("opacity-55");

		fireEvent.dragEnd(card);
		expect(card).not.toHaveClass("opacity-55");
	});

	it("offers project-fit and auto-duck actions for loopable music", async () => {
		const originalAdd = useSoundsStore.getState().addSoundToTimeline;
		const addSoundToTimeline = vi.fn(async () => true);
		useSoundsStore.setState({ addSoundToTimeline });
		render(<SoundsView />);

		const moreActions = screen.getByLabelText("霓虹节拍的更多操作");
		fireEvent.pointerDown(moreActions, { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByText("循环并自动闪避"));

		expect(addSoundToTimeline).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "music",
				mode: "fit-project",
				autoDucking: true,
			})
		);
		useSoundsStore.setState({ addSoundToTimeline: originalAdd });
	});

	it("adds BPM-tagged music on the nearest beat", async () => {
		const originalAdd = useSoundsStore.getState().addSoundToTimeline;
		const addSoundToTimeline = vi.fn(async () => true);
		useSoundsStore.setState({ addSoundToTimeline });
		render(<SoundsView />);

		const moreActions = screen.getByLabelText("霓虹节拍的更多操作");
		fireEvent.pointerDown(moreActions, { button: 0, ctrlKey: false });
		fireEvent.click(await screen.findByText("按最近节拍添加"));

		expect(addSoundToTimeline).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "music",
				beatAlignment: "nearest",
			})
		);
		useSoundsStore.setState({ addSoundToTimeline: originalAdd });
	});

	it("shows current project audio as reusable library cards", () => {
		useMediaStore.setState({
			mediaItems: [
				{
					id: "project-audio-1",
					name: "generated-track.mp3",
					type: "audio",
					file: new File(["audio"], "generated-track.mp3", {
						type: "audio/mpeg",
					}),
					url: "blob:generated-track",
					duration: 30,
					metadata: { source: "ai-music", bpm: 96 },
				},
			],
		});
		render(<SoundsView />);

		fireEvent.click(screen.getByText("项目音频"));

		expect(screen.getByText("generated-track.mp3")).toBeVisible();
		expect(screen.getByText("96 BPM")).toBeVisible();
	});

	it("shows saved audio inside a custom folder", () => {
		const quietCurrent = BUILT_IN_AUDIO.find(
			(sound) => sound.name === "Quiet Current"
		);
		expect(quietCurrent).toBeDefined();
		if (!quietCurrent) return;
		useSoundsStore.setState({
			savedSounds: [
				{
					id: quietCurrent.id,
					kind: "music",
					name: quietCurrent.name,
					username: quietCurrent.username,
					previewUrl: quietCurrent.previewUrl,
					duration: quietCurrent.duration,
					tags: quietCurrent.tags,
					license: quietCurrent.license,
					savedAt: "2026-07-17T00:00:00.000Z",
					localizedName: quietCurrent.localizedName,
					localizedDescription: quietCurrent.localizedDescription,
					artworkColors: quietCurrent.artworkColors,
					bpm: quietCurrent.bpm,
					moods: quietCurrent.moods,
					scenes: quietCurrent.scenes,
					loopable: quietCurrent.loopable,
				},
			],
			audioFolders: [
				{
					id: "calm-folder",
					name: "安静常用",
					assetKeys: [`music:${quietCurrent.id}`],
					createdAt: 1,
					updatedAt: 1,
				},
			],
		});
		render(<SoundsView />);

		fireEvent.click(screen.getByText("安静常用"));

		expect(screen.getByText("静谧流光")).toBeVisible();
		expect(screen.getByText("1 项")).toBeVisible();
	});

	it("auto-places project-aware SFX suggestions at fast cuts", async () => {
		const clips: MediaElement[] = [0, 2, 4, 6].map((startTime, index) => ({
			id: `clip-${index}`,
			type: "media",
			mediaId: `media-${index}`,
			name: `Clip ${index}`,
			duration: 2,
			startTime,
			trimStart: 0,
			trimEnd: 0,
		}));
		const track: TimelineTrack = {
			id: "main",
			name: "Main",
			type: "media",
			elements: clips,
		};
		useTimelineStore.setState({ _tracks: [track], tracks: [track] });
		const originalAddCues = useSoundsStore.getState().addSoundCuesToTimeline;
		const addSoundCuesToTimeline = vi.fn(async () => 3);
		useSoundsStore.setState({ addSoundCuesToTimeline });
		render(<SoundsView />);

		fireEvent.click(
			screen.getByRole("button", { name: "适合本项目", pressed: false })
		);
		fireEvent.click(
			screen.getByRole("button", { name: "自动铺设 3 个建议音效" })
		);

		expect(addSoundCuesToTimeline).toHaveBeenCalledWith({
			cues: expect.arrayContaining([
				expect.objectContaining({ startTime: 2, kind: "sound-effect" }),
				expect.objectContaining({ startTime: 4, kind: "sound-effect" }),
				expect.objectContaining({ startTime: 6, kind: "sound-effect" }),
			]),
		});
		useSoundsStore.setState({ addSoundCuesToTimeline: originalAddCues });
	});
});
