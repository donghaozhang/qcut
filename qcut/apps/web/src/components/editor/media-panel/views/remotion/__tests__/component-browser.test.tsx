/**
 * Component Browser Tests
 *
 * Tests for the Remotion component browser UI including
 * RemotionView, ComponentCard, and ComponentPreviewModal.
 *
 * @module components/editor/media-panel/views/remotion/__tests__/component-browser.test
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { initPlatform } from "@qcut/platform-core";
import { createWebAdapter } from "@qcut/platform-web";
import type { RemotionComponentDefinition } from "@/lib/remotion/types";

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock the stores
const mockRemotionStore: {
	registeredComponents: Map<string, RemotionComponentDefinition>;
	isLoading: boolean;
	isInitialized: boolean;
	isFolderImporting: boolean;
	importedFolders: Map<string, unknown>;
	initialize: ReturnType<typeof vi.fn>;
	importFromFolder: ReturnType<typeof vi.fn>;
	refreshFolder: ReturnType<typeof vi.fn>;
	removeFolder: ReturnType<typeof vi.fn>;
} = {
	registeredComponents: new Map(),
	isLoading: false,
	isInitialized: true,
	isFolderImporting: false,
	importedFolders: new Map(),
	initialize: vi.fn(),
	importFromFolder: vi.fn(),
	refreshFolder: vi.fn(),
	removeFolder: vi.fn(),
};

const mockTimelineStore: {
	tracks: Array<{ id: string; type: string }>;
	addTrack: ReturnType<typeof vi.fn>;
	addElementToTrack: ReturnType<typeof vi.fn>;
} = {
	tracks: [],
	addTrack: vi.fn(() => "track-1"),
	addElementToTrack: vi.fn(),
};

const mockProjectStore = {
	activeProject: { fps: 30 },
};

vi.mock("@/stores/ai/remotion-store", () => ({
	useRemotionStore: Object.assign(
		(selectorOrUndefined?: (state: typeof mockRemotionStore) => unknown) => {
			if (typeof selectorOrUndefined === "function") {
				return selectorOrUndefined(mockRemotionStore);
			}
			return mockRemotionStore;
		},
		{
			getState: () => mockRemotionStore,
		}
	),
	useComponentsByCategory: vi.fn(),
	selectAllComponents: (state: typeof mockRemotionStore) =>
		Array.from(state.registeredComponents.values()),
}));

vi.mock("zustand/react/shallow", () => ({
	useShallow: <T,>(fn: (state: unknown) => T) => fn,
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: () => mockTimelineStore,
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: (selector: (state: typeof mockProjectStore) => unknown) =>
		selector(mockProjectStore),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock @remotion/player
vi.mock("@remotion/player", () => ({
	Player: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="remotion-player">{children}</div>
	),
}));

// Mock UI components that might cause issues
vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => (
		<div className={className} data-testid="scroll-area">
			{children}
		</div>
	),
}));

beforeAll(() => {
	initPlatform(createWebAdapter());
});

// ============================================================================
// Test Data
// ============================================================================

// Mock schema that satisfies the type checker
const createMockSchema = () => ({ safeParse: vi.fn() }) as never;

const mockComponent: RemotionComponentDefinition = {
	id: "test-component-1",
	name: "Test Component",
	description: "A test component for testing",
	category: "template",
	durationInFrames: 90,
	fps: 30,
	width: 1920,
	height: 1080,
	schema: createMockSchema(),
	defaultProps: { text: "Hello" },
	component: () => <div>Test Component</div>,
	source: "built-in",
	tags: ["test", "template"],
	version: "1.0.0",
	author: "Test",
};

const mockTextComponent: RemotionComponentDefinition = {
	id: "test-text-1",
	name: "Text Animation",
	description: "Animated text component",
	category: "text",
	durationInFrames: 60,
	fps: 30,
	width: 1920,
	height: 1080,
	schema: createMockSchema(),
	defaultProps: { text: "Hello" },
	component: () => <div>Text Animation</div>,
	source: "built-in",
	tags: ["text", "animation"],
	version: "1.0.0",
	author: "Test",
};

const mockTransitionComponent: RemotionComponentDefinition = {
	id: "test-transition-1",
	name: "Fade Transition",
	description: "A fade transition effect",
	category: "transition",
	durationInFrames: 30,
	fps: 30,
	width: 1920,
	height: 1080,
	schema: createMockSchema(),
	defaultProps: {},
	component: () => <div>Fade Transition</div>,
	source: "built-in",
	tags: ["transition", "fade"],
	version: "1.0.0",
	author: "Test",
};

// ============================================================================
// Component Card Tests
// ============================================================================

describe("ComponentCard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render component name", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		expect(screen.getByText("Test Component")).toBeInTheDocument();
	});

	it("should render component description", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		expect(
			screen.getByText("A test component for testing")
		).toBeInTheDocument();
	});

	it("should render duration badge", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		// 90 frames / 30 fps = 3.0 seconds
		expect(screen.getByText("3.0s")).toBeInTheDocument();
	});

	it("should call onAdd when clicked", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		const card = screen.getByRole("button", {
			name: /add test component to timeline/i,
		});
		fireEvent.click(card);

		expect(onAdd).toHaveBeenCalledWith(mockComponent);
	});

	it("should call onAdd when pressing Enter", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		const card = screen.getByRole("button", {
			name: /add test component to timeline/i,
		});
		fireEvent.keyDown(card, { key: "Enter" });

		expect(onAdd).toHaveBeenCalledWith(mockComponent);
	});

	it("should call onAdd when pressing Space", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		const card = screen.getByRole("button", {
			name: /add test component to timeline/i,
		});
		fireEvent.keyDown(card, { key: " " });

		expect(onAdd).toHaveBeenCalledWith(mockComponent);
	});

	it("should have correct test id", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} />);

		expect(
			screen.getByTestId("component-card-test-component-1")
		).toBeInTheDocument();
	});

	it("should render in compact mode", async () => {
		const { ComponentCard } = await import("../component-card");
		const onAdd = vi.fn();

		render(<ComponentCard component={mockComponent} onAdd={onAdd} compact />);

		// In compact mode, description should not be shown
		expect(
			screen.queryByText("A test component for testing")
		).not.toBeInTheDocument();
	});
});

// ============================================================================
// RemotionView Tests
// ============================================================================

describe("RemotionView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRemotionStore.registeredComponents = new Map();
		mockRemotionStore.isLoading = false;
		mockRemotionStore.isInitialized = true;
		mockTimelineStore.tracks = [];
	});

	it("should render the panel", async () => {
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByTestId("remotion-panel")).toBeInTheDocument();
	});

	it("should render search input", async () => {
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByTestId("remotion-search-input")).toBeInTheDocument();
		expect(
			screen.getByPlaceholderText(/search components/i)
		).toBeInTheDocument();
	});

	it("should show empty state when no components", async () => {
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByText(/no remotion components/i)).toBeInTheDocument();
	});

	it("should show loading state", async () => {
		mockRemotionStore.isLoading = true;
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		// Should show loader
		const panel = screen.queryByTestId("remotion-panel");
		expect(panel).not.toBeInTheDocument();
	});

	it("should display components when registered", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByText("Test Component")).toBeInTheDocument();
		expect(screen.getByText("Text Animation")).toBeInTheDocument();
	});

	it("should filter components by search query", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		const searchInput = screen.getByTestId("remotion-search-input");
		await userEvent.type(searchInput, "Text");

		// Should only show text component
		await waitFor(() => {
			expect(screen.getByText("Text Animation")).toBeInTheDocument();
			expect(screen.queryByText("Test Component")).not.toBeInTheDocument();
		});
	});

	it("should filter components by tag", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		const searchInput = screen.getByTestId("remotion-search-input");
		await userEvent.type(searchInput, "animation");

		// Should show text component (has "animation" tag)
		await waitFor(() => {
			expect(screen.getByText("Text Animation")).toBeInTheDocument();
		});
	});

	it("should show no results message when search has no matches", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		const searchInput = screen.getByTestId("remotion-search-input");
		await userEvent.type(searchInput, "nonexistent");

		await waitFor(() => {
			expect(screen.getByText(/no components found/i)).toBeInTheDocument();
		});
	});

	it("should clear search when clicking X button", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		const searchInput = screen.getByTestId("remotion-search-input");
		await userEvent.type(searchInput, "Text");

		// Find and click clear button
		const clearButton = screen.getByRole("button", { name: /clear search/i });
		fireEvent.click(clearButton);

		// Should show all components again
		await waitFor(() => {
			expect(screen.getByText("Test Component")).toBeInTheDocument();
			expect(screen.getByText("Text Animation")).toBeInTheDocument();
		});
	});

	it("should display category tabs", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /custom/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /templates/i })).toBeInTheDocument();
		expect(
			screen.getByRole("tab", { name: /animations/i })
		).toBeInTheDocument();
	});

	it("should group components by category", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
			[mockTransitionComponent.id, mockTransitionComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		// Should show category sections
		expect(screen.getByTestId("category-section-template")).toBeInTheDocument();
		expect(screen.getByTestId("category-section-text")).toBeInTheDocument();
		expect(
			screen.getByTestId("category-section-transition")
		).toBeInTheDocument();
	});

	it("should show component count in footer", async () => {
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
			[mockTextComponent.id, mockTextComponent],
		]);

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(screen.getByText(/2 components/i)).toBeInTheDocument();
	});

	it("should initialize store if not initialized", async () => {
		mockRemotionStore.isInitialized = false;
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		expect(mockRemotionStore.initialize).toHaveBeenCalled();
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Component Browser Integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRemotionStore.registeredComponents = new Map([
			[mockComponent.id, mockComponent],
		]);
		mockRemotionStore.isLoading = false;
		mockRemotionStore.isInitialized = true;
		mockTimelineStore.tracks = [];
	});

	it("should add component to timeline when clicked", async () => {
		const { toast } = await import("sonner");
		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		// Click on the component card
		const card = screen.getByTestId("component-card-test-component-1");
		fireEvent.click(card);

		// Should create a track and add element
		expect(mockTimelineStore.addTrack).toHaveBeenCalledWith("remotion");
		expect(mockTimelineStore.addElementToTrack).toHaveBeenCalledWith(
			"track-1",
			expect.objectContaining({
				type: "remotion",
				name: "Test Component",
				componentId: "test-component-1",
			})
		);
		expect(toast.success).toHaveBeenCalledWith(
			'Added "Test Component" to timeline'
		);
	});

	it("should use existing remotion track if available", async () => {
		mockTimelineStore.tracks = [{ id: "existing-track", type: "remotion" }];

		const { RemotionView } = await import("../index");

		render(<RemotionView />);

		const card = screen.getByTestId("component-card-test-component-1");
		fireEvent.click(card);

		// Should NOT create a new track
		expect(mockTimelineStore.addTrack).not.toHaveBeenCalled();
		// Should add to existing track
		expect(mockTimelineStore.addElementToTrack).toHaveBeenCalledWith(
			"existing-track",
			expect.anything()
		);
	});
});
