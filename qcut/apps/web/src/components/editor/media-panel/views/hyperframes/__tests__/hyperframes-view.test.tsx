import { fireEvent, render, screen, waitFor } from "@/test/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperframesComposition } from "@/lib/hyperframes";
import { HyperframesView } from "../index";

const mocks = vi.hoisted(() => {
	const hyperframesState = {
		compositions: [] as HyperframesComposition[],
		initialize: vi.fn(),
		upsertComposition: vi.fn(),
		removeComposition: vi.fn(),
	};
	const timelineState = {
		findOrCreateTrack: vi.fn(() => "hyperframes-track"),
		addElementToTrack: vi.fn(),
	};
	const usePlaybackStore = Object.assign(vi.fn(), {
		getState: () => ({ currentTime: 2.5 }),
	});
	return {
		hyperframesState,
		timelineState,
		usePlaybackStore,
		hasCapability: vi.fn(() => true),
		select: vi.fn(),
		toastSuccess: vi.fn(),
		toastWarning: vi.fn(),
		toastError: vi.fn(),
	};
});

vi.mock("@qcut/platform-core", () => ({
	PlatformCapability: { Hyperframes: "hyperframes" },
	platform: () => ({
		hasCapability: mocks.hasCapability,
		hyperframes: { select: mocks.select },
	}),
}));

vi.mock("@/stores/ai/hyperframes-store", () => ({
	useHyperframesStore: <T,>(
		selector: (state: typeof mocks.hyperframesState) => T
	): T => selector(mocks.hyperframesState),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: <T,>(
		selector: (state: typeof mocks.timelineState) => T
	): T => selector(mocks.timelineState),
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: mocks.usePlaybackStore,
}));

vi.mock("sonner", () => ({
	toast: {
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
		error: mocks.toastError,
	},
}));

function composition(): HyperframesComposition {
	return {
		id: "main",
		name: "Launch title",
		sourcePath: "/project/index.html",
		projectPath: "/project",
		duration: 4,
		durationIsEstimated: false,
		width: 1920,
		height: 1080,
		fps: 30,
		variables: [
			{
				id: "title",
				type: "string",
				label: "Title",
				default: "Hello",
			},
		],
		defaultVariableValues: { title: "Hello" },
		warnings: [],
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hyperframesState.compositions = [];
	mocks.hasCapability.mockReturnValue(true);
	mocks.timelineState.findOrCreateTrack.mockReturnValue("hyperframes-track");
});

describe("HyperframesView", () => {
	it("imports and parses a selected local composition", async () => {
		mocks.select.mockResolvedValue({
			success: true,
			sourcePath: "/project/index.html",
			projectPath: "/project",
			html: `<!doctype html>
				<html>
					<head><title>Launch title</title></head>
					<body>
						<div
							data-composition-id="main"
							data-start="0"
							data-duration="4"
							data-width="1920"
							data-height="1080"
						></div>
					</body>
				</html>`,
		});

		render(<HyperframesView />);
		fireEvent.click(screen.getAllByRole("button", { name: "Import HTML" })[0]);

		await waitFor(() =>
			expect(mocks.hyperframesState.upsertComposition).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "main",
					name: "Launch title",
					sourcePath: "/project/index.html",
					duration: 4,
				})
			)
		);
		expect(mocks.toastSuccess).toHaveBeenCalledWith('Imported "Launch title"');
	});

	it("adds a library composition at the current playhead", () => {
		mocks.hyperframesState.compositions = [composition()];

		render(<HyperframesView />);
		fireEvent.click(screen.getByTitle("Add to timeline"));

		expect(mocks.timelineState.findOrCreateTrack).toHaveBeenCalledWith(
			"hyperframes"
		);
		expect(mocks.timelineState.addElementToTrack).toHaveBeenCalledWith(
			"hyperframes-track",
			expect.objectContaining({
				type: "hyperframes",
				compositionId: "main",
				sourcePath: "/project/index.html",
				startTime: 2.5,
				duration: 4,
				variableValues: { title: "Hello" },
			})
		);
	});
});
