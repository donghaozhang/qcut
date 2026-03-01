import "./moyin-test-setup.js";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { resetStore, useMoyinStore } from "./moyin-test-setup.js";

// Import components after mocks are registered
import { MoyinView } from "../index";
import { ScriptInput } from "../script-input";

// ============================================================
// MoyinView — Split Panel Layout
// ============================================================

describe("MoyinView", () => {
	beforeEach(() => {
		resetStore();
	});

	it("renders the split-panel layout with header", () => {
		render(<MoyinView />);
		expect(screen.getByText("Script Editor")).toBeTruthy();
		expect(screen.getByTestId("resizable-panel-group")).toBeTruthy();
	});

	it("renders both left and right panels", () => {
		render(<MoyinView />);
		const panels = screen.getAllByTestId("resizable-panel");
		expect(panels.length).toBe(2);
	});

	it("renders the resize handle between panels", () => {
		render(<MoyinView />);
		expect(screen.getByTestId("resizable-handle")).toBeTruthy();
	});

	it("shows status text when parsing is ready", () => {
		useMoyinStore.setState({
			parseStatus: "ready",
			characters: [
				{ id: "c1", name: "Alice" },
				{ id: "c2", name: "Bob" },
			],
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
		});
		render(<MoyinView />);
		expect(screen.getByText("2 characters, 1 scenes")).toBeTruthy();
	});

	it("shows parsing status", () => {
		useMoyinStore.setState({ parseStatus: "parsing" });
		render(<MoyinView />);
		const matches = screen.getAllByText("Parsing...");
		expect(matches.length).toBeGreaterThan(0);
	});
});

// ============================================================
// ScriptInput — Import/Create Tabs + Config
// ============================================================

describe("ScriptInput", () => {
	beforeEach(() => {
		resetStore();
	});

	it("renders Import and Create tabs", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Import")).toBeTruthy();
		expect(screen.getByText("Create")).toBeTruthy();
	});

	it("renders a textarea in Import tab by default", () => {
		render(<ScriptInput />);
		const textarea = screen.getByPlaceholderText(/paste screenplay text here/i);
		expect(textarea).toBeTruthy();
	});

	it("renders the Parse Script button", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Parse Script")).toBeTruthy();
	});

	it("disables the Parse Script button when textarea is empty", () => {
		render(<ScriptInput />);
		const button = screen.getByText("Parse Script").closest("button");
		expect(button?.disabled).toBe(true);
	});

	it("enables the Parse Script button when text is entered", () => {
		useMoyinStore.setState({ rawScript: "Some script text" });
		render(<ScriptInput />);
		const button = screen.getByText("Parse Script").closest("button");
		expect(button?.disabled).toBe(false);
	});

	it("does not render clear button when textarea is empty", () => {
		render(<ScriptInput />);
		const trashIcons = screen.queryAllByTestId("icon-trash");
		expect(trashIcons).toHaveLength(0);
	});

	it("renders clear button when text is present", () => {
		useMoyinStore.setState({ rawScript: "Something" });
		render(<ScriptInput />);
		const trashIcons = screen.queryAllByTestId("icon-trash");
		expect(trashIcons.length).toBeGreaterThan(0);
	});

	it("displays error message when parseError is set", () => {
		useMoyinStore.setState({
			rawScript: "text",
			parseError: "Failed to connect to API",
			parseStatus: "error",
		});
		render(<ScriptInput />);
		expect(screen.getByText("Failed to connect to API")).toBeTruthy();
	});

	it("shows loading state while parsing", () => {
		useMoyinStore.setState({
			rawScript: "text",
			parseStatus: "parsing",
		});
		render(<ScriptInput />);
		expect(screen.getByText("Parsing...")).toBeTruthy();
	});

	it("renders helper text about AI extraction", () => {
		render(<ScriptInput />);
		expect(
			screen.getByText(
				/AI will extract characters, scenes, and story structure/
			)
		).toBeTruthy();
	});

	it("shows Create tab with genre and synopsis when clicked", () => {
		render(<ScriptInput />);
		fireEvent.click(screen.getByText("Create"));
		expect(screen.getByText("Genre")).toBeTruthy();
		expect(screen.getByText("Synopsis / Idea")).toBeTruthy();
		expect(screen.getByText("Generate Script")).toBeTruthy();
	});

	it("renders language selector in configuration", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Language")).toBeTruthy();
	});

	it("renders scene count and shot count selectors", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Scene Count")).toBeTruthy();
		expect(screen.getByText("Shot Count")).toBeTruthy();
	});

	it("renders visual style selector", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Visual Style")).toBeTruthy();
	});

	it("renders camera profile selector", () => {
		render(<ScriptInput />);
		expect(screen.getByText("Camera Profile")).toBeTruthy();
	});

	it("shows API key warning when not configured", () => {
		useMoyinStore.setState({ chatConfigured: false });
		render(<ScriptInput />);
		expect(screen.getByText("API Not Configured")).toBeTruthy();
	});

	it("hides API key warning when configured", () => {
		useMoyinStore.setState({ chatConfigured: true });
		render(<ScriptInput />);
		expect(screen.queryByText("API Not Configured")).toBeNull();
	});
});

// ============================================================
// MoyinView — Contextual Details Header
// ============================================================

describe("MoyinView — Contextual Details Header", () => {
	beforeEach(resetStore);

	it("shows character name in details header when character selected", () => {
		useMoyinStore.setState({
			parseStatus: "ready",
			characters: [{ id: "c1", name: "Alice" }],
			selectedItemId: "c1",
			selectedItemType: "character",
		});
		render(<MoyinView />);
		expect(screen.getByText("Character: Alice")).toBeTruthy();
	});

	it("shows shot position in details header when shot selected", () => {
		useMoyinStore.setState({
			parseStatus: "ready",
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Walk",
					characterIds: [],
					characterVariations: {},
					imageStatus: "idle",
					imageProgress: 0,
					videoStatus: "idle",
					videoProgress: 0,
				},
			],
			selectedItemId: "shot1",
			selectedItemType: "shot",
		});
		render(<MoyinView />);
		expect(screen.getByText("Shot 1 of 1")).toBeTruthy();
	});
});
