import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaPanel } from "../index";
import { useMediaPanelStore } from "../store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { mockElectronAPI, setupElectronMock } from "@/test/mocks/electron";

vi.mock("../group-bar", () => ({
	GroupBar: () => <div data-testid="group-bar" />,
}));

vi.mock("../tabbar", () => ({
	TabBar: () => <div data-testid="tab-bar" />,
}));

vi.mock("../views/media", () => ({
	MediaView: () => <div data-testid="media-view" />,
}));

vi.mock("../views/audio", () => ({
	AudioView: () => <div data-testid="audio-view" />,
}));

vi.mock("../views/text", () => ({
	TextView: () => <div data-testid="text-view" />,
}));

vi.mock("../views/text2image", () => ({
	Text2ImageView: () => <div data-testid="text2image-view" />,
}));

vi.mock("@/components/editor/adjustment", () => ({
	AdjustmentPanel: () => <div data-testid="adjustment-view" />,
}));

vi.mock("../views/ai", () => ({
	AiView: () => <div data-testid="ai-view" />,
}));

vi.mock("../views/stickers", () => ({
	StickersView: () => <div data-testid="stickers-view" />,
}));

vi.mock("../views/captions", () => ({
	CaptionsView: () => <div data-testid="captions-view" />,
}));

vi.mock("../views/sounds", () => ({
	SoundsView: () => <div data-testid="sounds-view" />,
}));

vi.mock("../views/nano-edit", () => ({
	default: () => <div data-testid="nano-edit-view" />,
}));

vi.mock("../views/draw", () => ({
	default: () => <div data-testid="draw-view" />,
}));

vi.mock("../views/video-edit", () => ({
	default: () => <div data-testid="video-edit-view" />,
}));

vi.mock("@/components/editor/segmentation", () => ({
	SegmentationPanel: () => <div data-testid="segmentation-view" />,
}));

vi.mock("../views/remotion", () => ({
	RemotionView: () => <div data-testid="remotion-view" />,
}));

vi.mock("../views/word-timeline-view", () => ({
	WordTimelineView: () => <div data-testid="word-timeline-view" />,
}));

vi.mock("../views/project-folder", () => ({
	ProjectFolderView: () => <div data-testid="project-folder-view" />,
}));

vi.mock("../views/camera-selector", () => ({
	CameraSelectorView: () => <div data-testid="camera-selector-view" />,
}));

vi.mock("../views/pty-terminal/terminal-emulator", () => ({
	TerminalEmulator: ({ isVisible }: { isVisible?: boolean }) => (
		<div
			data-testid="terminal-emulator"
			data-visible={String(Boolean(isVisible))}
		/>
	),
}));

vi.mock("@/config/features", () => ({
	EFFECTS_ENABLED: false,
}));

describe("persistent PTY terminal in MediaPanel", () => {
	let cleanupElectron: () => void;

	beforeEach(() => {
		cleanupElectron = setupElectronMock();
		useMediaPanelStore.setState({
			activeGroup: "agents",
			activeTab: "pty",
			lastTabPerGroup: {
				media: "media",
				"ai-create": "ai",
				agents: "pty",
				edit: "word-timeline",
			},
			aiActiveTab: "text",
		});
		usePtyTerminalStore.setState({
			sessions: new Map([
				[
					"tab-1",
					{
						sessionId: "test-pty-session",
						status: "connected",
						exitCode: null,
						error: null,
						cliProvider: "claude",
						selectedModel: "anthropic/claude-sonnet-4",
						selectedClaudeModel: "opus",
						isGeminiMode: false,
						activeSkill: null,
						skillPromptSent: false,
						label: "Claude Code 1",
						createdAt: Date.now(),
					},
				],
			]),
			sessionOrder: ["tab-1"],
			activeSessionId: "tab-1",
			sessionId: "test-pty-session",
			status: "connected",
			exitCode: null,
			error: null,
			cols: 80,
			rows: 24,
			cliProvider: "claude",
			selectedModel: "anthropic/claude-sonnet-4",
			selectedClaudeModel: "opus",
			isGeminiMode: false,
			projectId: "test-project",
			workingDirectory: "",
			autoConnectOnLoad: true,
			hasUserDisconnected: false,
			autoConnectAttemptedProjectId: null,
			activeSkill: null,
			skillPromptSent: false,
		});
	});

	afterEach(() => {
		cleanupElectron();
	});

	it("keeps PTY mounted and toggles visibility across tab switches", () => {
		render(<MediaPanel />);

		expect(screen.getByTestId("pty-terminal-view")).toBeInTheDocument();
		expect(screen.getByTestId("terminal-emulator")).toHaveAttribute(
			"data-visible",
			"true"
		);
		expect(screen.queryByTestId("media-view")).not.toBeInTheDocument();

		act(() => {
			useMediaPanelStore.getState().setActiveTab("media");
		});

		expect(screen.getByTestId("pty-terminal-view")).toBeInTheDocument();
		expect(screen.getByTestId("terminal-emulator")).toHaveAttribute(
			"data-visible",
			"false"
		);
		expect(screen.getByTestId("media-view")).toBeInTheDocument();
		expect(usePtyTerminalStore.getState().sessionId).toBe("test-pty-session");
		expect(mockElectronAPI.pty?.kill).not.toHaveBeenCalled();
	});

	it("does not kill PTY session during rapid tab switches", () => {
		render(<MediaPanel />);

		act(() => {
			useMediaPanelStore.getState().setActiveTab("media");
			useMediaPanelStore.getState().setActiveTab("sounds");
			useMediaPanelStore.getState().setActiveTab("pty");
			useMediaPanelStore.getState().setActiveTab("media");
			useMediaPanelStore.getState().setActiveTab("pty");
		});

		expect(mockElectronAPI.pty?.kill).not.toHaveBeenCalled();
		expect(screen.getByTestId("pty-terminal-view")).toBeInTheDocument();
	});
});
