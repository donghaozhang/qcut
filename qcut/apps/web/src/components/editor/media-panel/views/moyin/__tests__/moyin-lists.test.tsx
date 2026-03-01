import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useMoyinStore } from "@/stores/moyin/moyin-store";

// ── Shared mocks (hoisted by Vitest before imports) ──
vi.mock("@tanstack/react-router", async () => (await import("./moyin-mock-defs")).tanstackRouter);
vi.mock("lucide-react", async () => (await import("./moyin-mock-defs")).lucideReact);
vi.mock("@/components/ui/button", async () => (await import("./moyin-mock-defs")).uiButton);
vi.mock("@/components/ui/textarea", async () => (await import("./moyin-mock-defs")).uiTextarea);
vi.mock("@/components/ui/card", async () => (await import("./moyin-mock-defs")).uiCard);
vi.mock("@/components/ui/badge", async () => (await import("./moyin-mock-defs")).uiBadge);
vi.mock("@/components/ui/progress", async () => (await import("./moyin-mock-defs")).uiProgress);
vi.mock("@/components/ui/input", async () => (await import("./moyin-mock-defs")).uiInput);
vi.mock("@/components/ui/checkbox", async () => (await import("./moyin-mock-defs")).uiCheckbox);
vi.mock("@/components/ui/label", async () => (await import("./moyin-mock-defs")).uiLabel);
vi.mock("@/components/ui/select", async () => (await import("./moyin-mock-defs")).uiSelect);
vi.mock("@/components/ui/dropdown-menu", async () => (await import("./moyin-mock-defs")).uiDropdownMenu);
vi.mock("@/components/ui/dialog", async () => (await import("./moyin-mock-defs")).uiDialog);
vi.mock("@/components/ui/resizable", async () => (await import("./moyin-mock-defs")).uiResizable);
vi.mock("@/lib/moyin/script/example-scripts", async () => (await import("./moyin-mock-defs")).exampleScripts);
vi.mock("@/lib/moyin/presets/visual-styles", async () => (await import("./moyin-mock-defs")).visualStyles);
vi.mock("@/lib/moyin/presets/cinematography-profiles", async () => (await import("./moyin-mock-defs")).cinematographyProfiles);
vi.mock("@/lib/utils", async () => (await import("./moyin-mock-defs")).utils);
vi.mock("../batch-progress", async () => (await import("./moyin-mock-defs")).batchProgress);

// ── Component imports (resolved after mocks) ──
import { CharacterList } from "../character-list";
import { SceneList } from "../scene-list";
import { GenerateActions } from "../generate-actions";
import {
	EpisodeContextMenu,
	SceneContextMenu,
	ShotContextMenu,
} from "../tree-context-menu";

function resetStore() {
	useMoyinStore.getState().reset();
}

// ============================================================
// CharacterList — Search Filter
// ============================================================

describe("CharacterList — Search", () => {
	beforeEach(() => {
		resetStore();
	});

	it("renders search input when characters exist", () => {
		useMoyinStore.setState({
			characters: [
				{ id: "c1", name: "Alice" },
				{ id: "c2", name: "Bob" },
			],
		});
		render(<CharacterList />);
		expect(screen.getByPlaceholderText("Search characters...")).toBeTruthy();
	});

	it("does not render search when no characters", () => {
		render(<CharacterList />);
		expect(screen.queryByPlaceholderText("Search characters...")).toBeNull();
	});

	it("filters characters by name", () => {
		useMoyinStore.setState({
			characters: [
				{ id: "c1", name: "Alice" },
				{ id: "c2", name: "Bob" },
			],
		});
		render(<CharacterList />);
		const input = screen.getByPlaceholderText("Search characters...");
		fireEvent.change(input, { target: { value: "alice" } });
		expect(screen.getByText("Alice")).toBeTruthy();
		expect(screen.queryByText("Bob")).toBeNull();
	});
});

// ============================================================
// SceneList — Search Filter
// ============================================================

describe("SceneList — Search", () => {
	beforeEach(() => {
		resetStore();
	});

	it("renders search input when scenes exist", () => {
		useMoyinStore.setState({
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
		});
		render(<SceneList />);
		expect(screen.getByPlaceholderText("Search scenes...")).toBeTruthy();
	});

	it("filters scenes by location", () => {
		useMoyinStore.setState({
			scenes: [
				{ id: "s1", location: "Park", time: "Day", atmosphere: "" },
				{ id: "s2", location: "Office", time: "Night", atmosphere: "" },
			],
		});
		render(<SceneList />);
		const input = screen.getByPlaceholderText("Search scenes...");
		fireEvent.change(input, { target: { value: "park" } });
		expect(screen.getByText("Park")).toBeTruthy();
		expect(screen.queryByText("Office")).toBeNull();
	});
});

// ============================================================
// GenerateActions — Export & Completion Stats
// ============================================================

describe("GenerateActions — Export & Stats", () => {
	beforeEach(() => {
		resetStore();
	});

	it("shows completion stats when shots exist", () => {
		useMoyinStore.setState({
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Test",
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
					actionSummary: "Test 2",
					characterIds: [],
					characterVariations: {},
					imageStatus: "idle",
					imageProgress: 0,
					videoStatus: "idle",
					videoProgress: 0,
				},
			],
		});
		render(<GenerateActions />);
		expect(screen.getByText("Images: 1/2")).toBeTruthy();
		expect(screen.getByText("Videos: 0/2")).toBeTruthy();
	});

	it("shows export button when done", () => {
		useMoyinStore.setState({
			generationStatus: "done",
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Test",
					characterIds: [],
					characterVariations: {},
					imageStatus: "idle",
					imageProgress: 0,
					videoStatus: "idle",
					videoProgress: 0,
				},
			],
		});
		render(<GenerateActions />);
		expect(screen.getByText("Export")).toBeTruthy();
	});

	it("shows retry button on generation error", () => {
		useMoyinStore.setState({
			generationError: "API timeout",
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
		});
		render(<GenerateActions />);
		expect(screen.getByText("API timeout")).toBeTruthy();
		expect(screen.getByText("Retry")).toBeTruthy();
	});
});

// ============================================================
// Context Menus — Duplicate
// ============================================================

describe("Context Menus — Duplicate", () => {
	beforeEach(() => {
		resetStore();
	});

	it("EpisodeContextMenu renders Duplicate option", () => {
		useMoyinStore.setState({
			episodes: [{ id: "ep1", index: 0, title: "Episode 1", sceneIds: [] }],
		});
		render(<EpisodeContextMenu episodeId="ep1" onEdit={() => {}} />);
		expect(screen.getByText("Duplicate")).toBeTruthy();
	});

	it("SceneContextMenu renders Duplicate option", () => {
		render(<SceneContextMenu sceneId="s1" onEdit={() => {}} />);
		expect(screen.getByText("Duplicate")).toBeTruthy();
	});

	it("ShotContextMenu renders Duplicate option", () => {
		render(<ShotContextMenu shotId="shot1" />);
		expect(screen.getByText("Duplicate")).toBeTruthy();
	});
});

// ============================================================
// Skeleton Loaders
// ============================================================

describe("Skeleton Loaders", () => {
	beforeEach(() => {
		resetStore();
	});

	it("CharacterList shows skeleton during calibration", () => {
		useMoyinStore.setState({
			characterCalibrationStatus: "calibrating",
			characters: [{ id: "c1", name: "Hero" }],
		});
		render(<CharacterList />);
		expect(screen.getByLabelText("Loading characters")).toBeTruthy();
	});

	it("SceneList shows skeleton during calibration", () => {
		useMoyinStore.setState({
			sceneCalibrationStatus: "calibrating",
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
		});
		render(<SceneList />);
		expect(screen.getByLabelText("Loading scenes")).toBeTruthy();
	});

	it("CharacterList hides skeleton when not calibrating", () => {
		useMoyinStore.setState({
			characterCalibrationStatus: "idle",
			characters: [{ id: "c1", name: "Hero" }],
		});
		render(<CharacterList />);
		expect(screen.queryByLabelText("Loading characters")).toBeNull();
	});
});
