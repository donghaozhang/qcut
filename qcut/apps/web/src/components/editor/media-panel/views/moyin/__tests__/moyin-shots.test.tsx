import "./moyin-test-setup.js";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { resetStore, useMoyinStore } from "./moyin-test-setup.js";

// Import components after mocks are registered
import { ShotBreakdown } from "../shot-breakdown";

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
