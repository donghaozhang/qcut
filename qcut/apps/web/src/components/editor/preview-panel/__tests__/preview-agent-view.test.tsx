import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewAgentView } from "../preview-agent-view";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import {
	getDefaultCodexModel,
	getDefaultClaudeModel,
} from "@/types/cli-provider";

// Mock terminal emulator — it requires xterm.js which isn't available in test
vi.mock(
	"@/components/editor/media-panel/views/pty-terminal/terminal-emulator",
	() => ({
		TerminalEmulator: ({ sessionId }: { sessionId: string | null }) => (
			<div data-testid="terminal-emulator" data-session={sessionId} />
		),
	})
);

vi.mock("lucide-react", () => ({
	Play: () => <svg data-testid="icon-play" />,
	Square: () => <svg data-testid="icon-square" />,
	Bot: () => <svg data-testid="icon-bot" />,
	Loader2: () => <svg data-testid="icon-loader" />,
}));

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		...props
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		[key: string]: unknown;
	}) => (
		<button onClick={onClick} disabled={disabled} {...props}>
			{children}
		</button>
	),
}));

vi.mock("@/lib/utils", () => ({
	cn: (...classes: (string | boolean | undefined)[]) =>
		classes.filter(Boolean).join(" "),
}));

const resetStore = () => {
	usePtyTerminalStore.setState({
		sessions: new Map(),
		sessionOrder: [],
		activeSessionId: null,
		sessionId: null,
		status: "disconnected",
		exitCode: null,
		error: null,
		cols: 80,
		rows: 24,
		cliProvider: "claude",
		selectedModel: getDefaultCodexModel(),
		selectedClaudeModel: getDefaultClaudeModel(),
		isGeminiMode: false,
		projectId: null,
		workingDirectory: "",
		autoConnectOnLoad: true,
		hasUserDisconnected: false,
		autoConnectAttemptedProjectId: null,
		activeSkill: null,
		skillPromptSent: false,
		terminalMountedIn: null,
	});
};

describe("PreviewAgentView", () => {
	beforeEach(() => {
		resetStore();
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up mount claim
		usePtyTerminalStore.setState({ terminalMountedIn: null });
	});

	it("renders idle state when disconnected", () => {
		render(<PreviewAgentView />);

		expect(screen.getByText("No agent running")).toBeTruthy();
		expect(screen.getByText("Start Agent")).toBeTruthy();
	});

	it("shows provider label from store", () => {
		render(<PreviewAgentView />);

		// Default provider is "claude" → label is "Claude Code"
		expect(screen.getByText("Claude Code")).toBeTruthy();
	});

	it("renders terminal emulator when connected", () => {
		usePtyTerminalStore.setState({
			status: "connected",
			sessionId: "test-session-123",
		});

		render(<PreviewAgentView />);

		const terminal = screen.getByTestId("terminal-emulator");
		expect(terminal).toBeTruthy();
		expect(terminal.getAttribute("data-session")).toBe("test-session-123");
	});

	it("shows Stop button when connected", () => {
		usePtyTerminalStore.setState({
			status: "connected",
			sessionId: "test-session",
		});

		render(<PreviewAgentView />);

		expect(screen.getByText("Stop")).toBeTruthy();
	});

	it("shows Connecting state", () => {
		usePtyTerminalStore.setState({
			status: "connecting",
		});

		render(<PreviewAgentView />);

		expect(screen.getAllByText("Connecting...").length).toBeGreaterThan(0);
	});

	it("claims terminal mount as preview-panel on mount", () => {
		render(<PreviewAgentView />);

		expect(usePtyTerminalStore.getState().terminalMountedIn).toBe(
			"preview-panel"
		);
	});

	it("releases terminal mount on unmount", () => {
		const { unmount } = render(<PreviewAgentView />);

		expect(usePtyTerminalStore.getState().terminalMountedIn).toBe(
			"preview-panel"
		);

		unmount();

		expect(usePtyTerminalStore.getState().terminalMountedIn).toBeNull();
	});
});
