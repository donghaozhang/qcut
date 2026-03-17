/**
 * Tests for Round 25: prompt toggle aria-pressed, script tabs ARIA,
 * progress bar labels.
 * Separate file to avoid mock conflicts with other test files.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => {
	const icon = (name: string) => (props: Record<string, unknown>) => (
		<span data-testid={`icon-${name}`} {...props} />
	);
	return {
		ChevronDownIcon: icon("chevron-down"),
		ChevronRightIcon: icon("chevron-right"),
		CopyIcon: icon("copy"),
		ImageIcon: icon("image"),
		FilmIcon: icon("film"),
		SquareIcon: icon("square"),
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
		MessageSquareIcon: icon("message-square"),
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

vi.mock("@/components/ui/textarea", () => ({
	Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/checkbox", () => ({
	Checkbox: (props: Record<string, unknown>) => (
		<input type="checkbox" {...props} />
	),
}));

import { PromptEditor } from "../prompt-editor";

describe("PromptEditor — Language Toggle aria-pressed", () => {
	it("marks EN as pressed by default", () => {
		render(<PromptEditor draft={{ imagePrompt: "test" }} onUpdate={vi.fn()} />);
		const enBtn = screen.getAllByText("EN")[0];
		expect(enBtn.getAttribute("aria-pressed")).toBe("true");
		const zhBtn = screen.getAllByText("ZH")[0];
		expect(zhBtn.getAttribute("aria-pressed")).toBe("false");
	});

	it("toggles aria-pressed when ZH is clicked", () => {
		render(<PromptEditor draft={{ imagePrompt: "test" }} onUpdate={vi.fn()} />);
		const zhBtn = screen.getAllByText("ZH")[0];
		fireEvent.click(zhBtn);
		expect(zhBtn.getAttribute("aria-pressed")).toBe("true");
		const enBtn = screen.getAllByText("EN")[0];
		expect(enBtn.getAttribute("aria-pressed")).toBe("false");
	});
});

describe("PromptEditor — Section aria-expanded", () => {
	it("renders section header with aria-expanded", () => {
		render(<PromptEditor draft={{ imagePrompt: "test" }} onUpdate={vi.fn()} />);
		const header = screen.getByText("Image Prompt").closest("button");
		expect(header?.getAttribute("aria-expanded")).toBe("true");
	});
});
