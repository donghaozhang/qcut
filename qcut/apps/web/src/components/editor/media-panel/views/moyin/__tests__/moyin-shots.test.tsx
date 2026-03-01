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
import { ShotBreakdown } from "../shot-breakdown";

function resetStore() {
	useMoyinStore.getState().reset();
}

// ============================================================
// ShotBreakdown — Grid/List Toggle
// ============================================================

describe("ShotBreakdown — View Toggle", () => {
	beforeEach(() => {
		resetStore();
	});

	it("renders view toggle buttons when shots exist", () => {
		useMoyinStore.setState({
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Test shot",
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

	it("shows shot count text", () => {
		useMoyinStore.setState({
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Test shot",
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
		// Shot count shown in toolbar
		const countEls = screen.getAllByText("1");
		expect(countEls.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================
// ShotBreakdown — Multi-Select & Bulk Delete
// ============================================================

describe("ShotBreakdown — Multi-Select", () => {
	const shotsData = [
		{
			id: "shot1",
			index: 0,
			sceneRefId: "s1",
			actionSummary: "Shot 1",
			characterIds: [],
			characterVariations: {},
			imageStatus: "idle" as const,
			imageProgress: 0,
			videoStatus: "idle" as const,
			videoProgress: 0,
		},
		{
			id: "shot2",
			index: 1,
			sceneRefId: "s1",
			actionSummary: "Shot 2",
			characterIds: [],
			characterVariations: {},
			imageStatus: "idle" as const,
			imageProgress: 0,
			videoStatus: "idle" as const,
			videoProgress: 0,
		},
	];

	beforeEach(() => {
		resetStore();
		useMoyinStore.setState({
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: shotsData,
			selectedShotIds: new Set<string>(),
		});
	});

	it("shows bulk action bar when shots are selected", () => {
		useMoyinStore.setState({ selectedShotIds: new Set(["shot1"]) });
		render(<ShotBreakdown />);
		expect(screen.getByText("1 selected")).toBeTruthy();
		expect(screen.getByText("Delete")).toBeTruthy();
		expect(screen.getByText("Clear")).toBeTruthy();
	});

	it("hides bulk action bar when no shots are selected", () => {
		render(<ShotBreakdown />);
		expect(screen.queryByText("selected")).toBeNull();
	});

	it("bulk delete button has aria-label", () => {
		useMoyinStore.setState({ selectedShotIds: new Set(["shot1"]) });
		render(<ShotBreakdown />);
		expect(screen.getByLabelText("Delete selected shots")).toBeTruthy();
	});
});

// ============================================================
// ShotBreakdown — Filter & Search
// ============================================================

describe("ShotBreakdown — Filter & Search", () => {
	beforeEach(() => {
		resetStore();
		useMoyinStore.setState({
			parseStatus: "ready",
			scenes: [{ id: "s1", location: "Park", time: "Day", atmosphere: "" }],
			shots: [
				{
					id: "shot1",
					index: 0,
					sceneRefId: "s1",
					actionSummary: "Hero walks",
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
					actionSummary: "Villain appears",
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

	it("renders search input", () => {
		render(<ShotBreakdown />);
		expect(screen.getByLabelText("Search shots")).toBeTruthy();
	});

	it("renders filter dropdown", () => {
		render(<ShotBreakdown />);
		expect(screen.getByLabelText("Filter shots")).toBeTruthy();
	});

	it("shows all shots by default", () => {
		render(<ShotBreakdown />);
		expect(screen.getByText("Hero walks")).toBeTruthy();
		expect(screen.getByText("Villain appears")).toBeTruthy();
	});

	it("filters to show only shots with images", () => {
		render(<ShotBreakdown />);
		const select = screen.getByLabelText("Filter shots");
		fireEvent.change(select, { target: { value: "has-image" } });
		expect(screen.getByText("Hero walks")).toBeTruthy();
		expect(screen.queryByText("Villain appears")).toBeNull();
	});

	it("filters to show incomplete shots", () => {
		render(<ShotBreakdown />);
		const select = screen.getByLabelText("Filter shots");
		fireEvent.change(select, { target: { value: "incomplete" } });
		// Both shots are incomplete (neither has both image AND video completed)
		expect(screen.getByText("Hero walks")).toBeTruthy();
		expect(screen.getByText("Villain appears")).toBeTruthy();
	});

	it("searches shots by action summary", () => {
		render(<ShotBreakdown />);
		const search = screen.getByLabelText("Search shots");
		fireEvent.change(search, { target: { value: "Hero" } });
		expect(screen.getByText("Hero walks")).toBeTruthy();
		expect(screen.queryByText("Villain appears")).toBeNull();
	});
});
