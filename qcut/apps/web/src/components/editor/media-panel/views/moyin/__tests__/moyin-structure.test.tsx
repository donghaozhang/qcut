import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useMoyinStore } from "@/stores/moyin/moyin-store";

// ── Shared mocks (hoisted by Vitest before imports) ──
vi.mock(
	"@tanstack/react-router",
	async () => (await import("./moyin-mock-defs")).tanstackRouter
);
vi.mock(
	"lucide-react",
	async () => (await import("./moyin-mock-defs")).lucideReact
);
vi.mock(
	"@/components/ui/button",
	async () => (await import("./moyin-mock-defs")).uiButton
);
vi.mock(
	"@/components/ui/textarea",
	async () => (await import("./moyin-mock-defs")).uiTextarea
);
vi.mock(
	"@/components/ui/card",
	async () => (await import("./moyin-mock-defs")).uiCard
);
vi.mock(
	"@/components/ui/badge",
	async () => (await import("./moyin-mock-defs")).uiBadge
);
vi.mock(
	"@/components/ui/progress",
	async () => (await import("./moyin-mock-defs")).uiProgress
);
vi.mock(
	"@/components/ui/input",
	async () => (await import("./moyin-mock-defs")).uiInput
);
vi.mock(
	"@/components/ui/checkbox",
	async () => (await import("./moyin-mock-defs")).uiCheckbox
);
vi.mock(
	"@/components/ui/label",
	async () => (await import("./moyin-mock-defs")).uiLabel
);
vi.mock(
	"@/components/ui/select",
	async () => (await import("./moyin-mock-defs")).uiSelect
);
vi.mock(
	"@/components/ui/dropdown-menu",
	async () => (await import("./moyin-mock-defs")).uiDropdownMenu
);
vi.mock(
	"@/components/ui/dialog",
	async () => (await import("./moyin-mock-defs")).uiDialog
);
vi.mock(
	"@/components/ui/resizable",
	async () => (await import("./moyin-mock-defs")).uiResizable
);
vi.mock(
	"@/lib/moyin/script/example-scripts",
	async () => (await import("./moyin-mock-defs")).exampleScripts
);
vi.mock(
	"@/lib/moyin/presets/visual-styles",
	async () => (await import("./moyin-mock-defs")).visualStyles
);
vi.mock(
	"@/lib/moyin/presets/cinematography-profiles",
	async () => (await import("./moyin-mock-defs")).cinematographyProfiles
);
vi.mock("@/lib/utils", async () => (await import("./moyin-mock-defs")).utils);
vi.mock(
	"../batch-progress",
	async () => (await import("./moyin-mock-defs")).batchProgress
);

// ── Component imports (resolved after mocks) ──
import { ShotBreakdown } from "../shot-breakdown";
import {
	EpisodeContextMenu,
	SceneContextMenu,
	ShotContextMenu,
} from "../tree-context-menu";
import { StructurePanel } from "../structure-panel";

function resetStore() {
	useMoyinStore.getState().reset();
}

// ============================================================
// Accessibility — Aria Labels
// ============================================================

describe("Accessibility — Aria Labels", () => {
	beforeEach(() => {
		resetStore();
	});

	it("ShotBreakdown view toggle buttons have aria-labels", () => {
		useMoyinStore.setState({
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
		});
		render(<ShotBreakdown />);
		expect(screen.getByLabelText("List view")).toBeTruthy();
		expect(screen.getByLabelText("Grid view")).toBeTruthy();
	});

	it("EpisodeContextMenu trigger has aria-label", () => {
		useMoyinStore.setState({
			episodes: [{ id: "ep1", index: 0, title: "Episode 1", sceneIds: [] }],
		});
		render(<EpisodeContextMenu episodeId="ep1" onEdit={() => {}} />);
		expect(screen.getByLabelText("Episode actions")).toBeTruthy();
	});

	it("SceneContextMenu trigger has aria-label", () => {
		render(<SceneContextMenu sceneId="s1" onEdit={() => {}} />);
		expect(screen.getByLabelText("Scene actions")).toBeTruthy();
	});

	it("ShotContextMenu trigger has aria-label", () => {
		render(<ShotContextMenu shotId="shot1" />);
		expect(screen.getByLabelText("Shot actions")).toBeTruthy();
	});
});

// ============================================================
// StructurePanel — Keyboard Shortcuts
// ============================================================

describe("StructurePanel — Keyboard Shortcuts", () => {
	beforeEach(() => {
		resetStore();
		useMoyinStore.setState({
			parseStatus: "ready",
			scriptData: {
				title: "Test",
				genre: "Drama",
				language: "English",
				characters: [],
				scenes: [],
				episodes: [],
				storyParagraphs: [],
			},
			episodes: [{ id: "ep1", index: 0, title: "Ep 1", sceneIds: ["s1"] }],
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Shot 1",
					characterIds: [],
					characterVariations: {},
					imageStatus: "idle",
					imageProgress: 0,
					videoStatus: "idle",
					videoProgress: 0,
				},
				{
					id: "shot2",
					index: 1,
					sceneRefId: "s1",
					actionSummary: "Shot 2",
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
	});

	it("Escape clears selection", () => {
		render(<StructurePanel />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(useMoyinStore.getState().selectedItemId).toBeNull();
	});

	it("ArrowDown selects next item", () => {
		render(<StructurePanel />);
		fireEvent.keyDown(window, { key: "ArrowDown" });
		expect(useMoyinStore.getState().selectedItemId).toBe("shot2");
	});

	it("ArrowUp selects previous item", () => {
		useMoyinStore.setState({ selectedItemId: "shot2" });
		render(<StructurePanel />);
		fireEvent.keyDown(window, { key: "ArrowUp" });
		expect(useMoyinStore.getState().selectedItemId).toBe("shot1");
	});

	it("Delete removes selected item", () => {
		render(<StructurePanel />);
		fireEvent.keyDown(window, { key: "Delete" });
		const state = useMoyinStore.getState();
		expect(state.selectedItemId).toBeNull();
		expect(state.shots.find((s) => s.id === "shot1")).toBeUndefined();
	});
});

// ============================================================
// StructurePanel — Tab Badges
// ============================================================

describe("StructurePanel — Tab Badges", () => {
	beforeEach(() => {
		resetStore();
		useMoyinStore.setState({
			parseStatus: "ready",
			scriptData: {
				title: "Test",
				genre: "Drama",
				language: "English",
				characters: [],
				scenes: [],
				episodes: [],
				storyParagraphs: [],
			},
			characters: [{ id: "c1", name: "Alice", role: "lead" }],
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Walk",
					characterIds: [],
					characterVariations: {},
					imageStatus: "completed",
					imageProgress: 100,
					videoStatus: "idle",
					videoProgress: 0,
				},
				{
					id: "shot2",
					index: 1,
					sceneRefId: "s1",
					actionSummary: "Run",
					characterIds: [],
					characterVariations: {},
					imageStatus: "idle",
					imageProgress: 0,
					videoStatus: "idle",
					videoProgress: 0,
				},
			],
		});
	});

	it("shows shot count badge on Shots tab", () => {
		render(<StructurePanel />);
		// Badge shows imagesDone/total next to Shots tab
		const allText = screen.getAllByText(/1\/2/);
		expect(allText.length).toBeGreaterThanOrEqual(1);
	});

	it("shows scene count badge on Scenes tab", () => {
		render(<StructurePanel />);
		// Scenes tab should show "1" badge for 1 scene
		const badges = screen.getAllByText("1");
		expect(badges.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================
// StructurePanel — Keyboard Hints
// ============================================================

describe("StructurePanel — Keyboard Hints", () => {
	beforeEach(resetStore);

	it("shows keyboard shortcut hints", () => {
		render(<StructurePanel />);
		expect(screen.getByLabelText("Keyboard shortcuts")).toBeTruthy();
		expect(screen.getByText("Navigate")).toBeTruthy();
		expect(screen.getByText("Undo")).toBeTruthy();
	});
});

// ============================================================
// StructurePanel — Empty State Hints
// ============================================================

describe("StructurePanel — Empty State Hints", () => {
	beforeEach(resetStore);

	it("shows upload hint when overview tab is empty", () => {
		render(<StructurePanel />);
		expect(screen.getByText("Upload or paste a script to begin.")).toBeTruthy();
	});
});

// ============================================================
// StructurePanel — Tab ARIA Attributes
// ============================================================

describe("StructurePanel — Tab ARIA Attributes", () => {
	beforeEach(resetStore);

	it("tabs have role=tab and aria-selected", () => {
		render(<StructurePanel />);
		const tabs = screen.getAllByRole("tab");
		expect(tabs.length).toBe(5);
		const selected = tabs.filter(
			(t) => t.getAttribute("aria-selected") === "true"
		);
		expect(selected.length).toBe(1);
	});

	it("tab bar has role=tablist", () => {
		render(<StructurePanel />);
		expect(screen.getByRole("tablist")).toBeTruthy();
	});
});
