import "./moyin-test-setup.js";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { resetStore, useMoyinStore } from "./moyin-test-setup.js";

// Import components after mocks are registered
import { CharacterList } from "../character-list";
import { SceneList } from "../scene-list";
import { GenerateActions } from "../generate-actions";
import {
	EpisodeContextMenu,
	SceneContextMenu,
	ShotContextMenu,
} from "../tree-context-menu";

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
