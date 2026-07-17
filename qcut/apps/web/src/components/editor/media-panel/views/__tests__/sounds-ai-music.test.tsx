import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleStore } from "@/stores/locale-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { AiMusicView } from "../sounds-ai-music";

const mocks = vi.hoisted(() => ({
	generate: vi.fn(),
	cancel: vi.fn(),
	importGeneratedMusic: vi.fn(),
	addMediaAtTime: vi.fn(() => true),
}));

vi.mock("@/hooks/use-ai-pipeline", () => ({
	useAIPipeline: () => ({
		generate: mocks.generate,
		cancel: mocks.cancel,
		isAvailable: true,
		isChecked: true,
		isGenerating: false,
		progress: null,
		error: null,
	}),
}));

vi.mock("@/lib/audio/ai-music", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/audio/ai-music")>();
	return { ...actual, importGeneratedMusic: mocks.importGeneratedMusic };
});

vi.mock("@/stores/project-store", () => ({
	useProjectStore: (
		selector: (state: { activeProject: { id: string } }) => unknown
	) => selector({ activeProject: { id: "project-1" } }),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: () => ({ addMediaAtTime: mocks.addMediaAtTime }),
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: { getState: () => ({ currentTime: 2.5 }) },
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

describe("AiMusicView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useLocaleStore.getState().setLocale({ locale: "zh" });
		useMediaPanelStore.setState({ activeSoundsTab: "ai-music" });
		mocks.generate.mockResolvedValue({
			success: true,
			outputPath: "/tmp/generated-track.mp3",
		});
		mocks.importGeneratedMusic.mockResolvedValue({
			id: "generated-media",
			name: "generated-track.mp3",
			type: "audio",
			file: new File(["audio"], "generated-track.mp3", {
				type: "audio/mpeg",
			}),
			url: "blob:generated-track",
			duration: 31,
		});
	});

	it("validates style before submitting", () => {
		render(<AiMusicView />);

		fireEvent.click(screen.getByRole("button", { name: "生成音乐" }));

		expect(screen.getByRole("alert")).toHaveTextContent("请输入音乐风格");
		expect(mocks.generate).not.toHaveBeenCalled();
	});

	it("generates real music and imports it into project audio", async () => {
		render(<AiMusicView />);
		fireEvent.change(screen.getByLabelText("风格"), {
			target: { value: "带柔和钢琴的 Lo-fi 嘻哈" },
		});
		fireEvent.change(screen.getByLabelText("情绪"), {
			target: { value: "温暖、有希望" },
		});
		fireEvent.change(screen.getByLabelText("使用场景"), {
			target: { value: "旅行 VLOG" },
		});

		fireEvent.click(screen.getByRole("button", { name: "生成音乐" }));

		await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
		expect(mocks.generate).toHaveBeenCalledWith(
			expect.objectContaining({
				command: "generate-music",
				projectId: "project-1",
				autoImport: false,
				args: expect.objectContaining({
					model: "minimax_music_v2_6",
					instrumental: true,
					text: expect.stringContaining("100 BPM"),
				}),
			})
		);
		await waitFor(() =>
			expect(screen.getByText("generated-track.mp3")).toBeVisible()
		);
		expect(mocks.importGeneratedMusic).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-1",
				outputPath: "/tmp/generated-track.mp3",
				bpm: 100,
			})
		);
	});

	it("adds the generated project item at the current playhead", async () => {
		render(<AiMusicView />);
		fireEvent.change(screen.getByLabelText("风格"), {
			target: { value: "电影感氛围配乐" },
		});
		fireEvent.click(screen.getByRole("button", { name: "生成音乐" }));
		const addButton = await screen.findByLabelText("添加到时间线");

		fireEvent.click(addButton);

		expect(mocks.addMediaAtTime).toHaveBeenCalledWith(
			expect.objectContaining({ id: "generated-media" }),
			2.5
		);
	});
});
