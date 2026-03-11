/**
 * Tests for Round 21: custom duration input, import progress a11y.
 * Separate file to avoid mock conflicts with moyin-round11.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useMoyinStore } from "@/stores/moyin/moyin-store";

vi.mock("lucide-react", () => {
	const icon = (name: string) => (props: Record<string, unknown>) => (
		<span data-testid={`icon-${name}`} {...props} />
	);
	return {
		CheckCircle2Icon: icon("check-circle"),
		CircleIcon: icon("circle"),
		Loader2: icon("loader"),
		XCircleIcon: icon("x-circle"),
		// Media panel store tab icons (transitive import via moyin-parse-actions)
		ArrowLeftRightIcon: icon("arrow-left-right"),
		ArrowUpFromLineIcon: icon("arrow-up-from-line"),
		BlendIcon: icon("blend"),
		BotIcon: icon("bot"),
		ClapperboardIcon: icon("clapperboard"),
		FolderOpenIcon: icon("folder-open"),
		FolderSync: icon("folder-sync"),
		Layers: icon("layers"),
		PaletteIcon: icon("palette"),
		ScissorsIcon: icon("scissors"),
		SparklesIcon: icon("sparkles"),
		SquareTerminalIcon: icon("square-terminal"),
		StickerIcon: icon("sticker"),
		TextSelect: icon("text-select"),
		TypeIcon: icon("type"),
		VideoIcon: icon("video"),
		VolumeXIcon: icon("volume-x"),
		Wand2Icon: icon("wand-2"),
		WandIcon: icon("wand"),
		SearchIcon: icon("search"),
		WrenchIcon: icon("wrench"),
	};
});

vi.mock("@/lib/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/label", () => ({
	Label: ({ children, ...props }: { children: React.ReactNode }) => (
		<label {...props}>{children}</label>
	),
}));

vi.mock("@/components/ui/input", () => ({
	Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/stores/moyin/moyin-store", async () => {
	const { create } = await import("zustand");
	const store = create(() => ({
		pipelineStep: null as string | null,
		pipelineProgress: {
			import: "pending",
			title_calibration: "pending",
			synopsis: "pending",
			shot_calibration: "pending",
			character_calibration: "pending",
			scene_calibration: "pending",
		},
	}));
	return { useMoyinStore: store };
});

import { DurationSelector } from "../shot-selectors";
import { ImportProgress } from "../import-progress";

describe("DurationSelector — Custom Input", () => {
	it("renders custom duration input field", () => {
		render(<DurationSelector value={5} onChange={vi.fn()} />);
		expect(screen.getByLabelText("Custom duration in seconds")).toBeTruthy();
	});

	it("renders preset buttons with aria-pressed", () => {
		render(<DurationSelector value={5} onChange={vi.fn()} />);
		const btn5 = screen.getByText("5s");
		expect(btn5.getAttribute("aria-pressed")).toBe("true");
		const btn3 = screen.getByText("3s");
		expect(btn3.getAttribute("aria-pressed")).toBe("false");
	});
});

describe("DurationSelector — Validation Feedback", () => {
	it("sets aria-invalid when custom input is out of range", () => {
		render(<DurationSelector value={5} onChange={vi.fn()} />);
		const input = screen.getByLabelText("Custom duration in seconds");
		fireEvent.change(input, { target: { value: "99" } });
		expect(input.getAttribute("aria-invalid")).toBe("true");
	});

	it("does not set aria-invalid for valid custom input", () => {
		render(<DurationSelector value={5} onChange={vi.fn()} />);
		const input = screen.getByLabelText("Custom duration in seconds");
		fireEvent.change(input, { target: { value: "15" } });
		expect(input.getAttribute("aria-invalid")).toBeNull();
	});
});

describe("ImportProgress — Accessibility", () => {
	it("renders step labels with aria-label including status", () => {
		useMoyinStore.setState({
			pipelineStep: "import",
			pipelineProgress: {
				import: "done",
				title_calibration: "active",
				synopsis: "pending",
				shot_calibration: "pending",
				character_calibration: "pending",
				scene_calibration: "pending",
			},
		});
		render(<ImportProgress />);
		expect(screen.getByLabelText("Import Script: completed")).toBeTruthy();
		expect(
			screen.getByLabelText("Title Calibration: in progress")
		).toBeTruthy();
	});
});
