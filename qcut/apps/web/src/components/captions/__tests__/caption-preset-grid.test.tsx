import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CAPTION_STYLE_PRESETS } from "@/lib/captions/workbench";
import { CaptionPresetGrid } from "../caption-preset-grid";

describe("CaptionPresetGrid", () => {
	it("renders visual previews for every shared preset", () => {
		render(
			<CaptionPresetGrid
				selectedId={CAPTION_STYLE_PRESETS[0]?.id}
				onSelect={vi.fn()}
			/>
		);

		expect(screen.getAllByRole("button")).toHaveLength(
			CAPTION_STYLE_PRESETS.length
		);
		expect(screen.getAllByText("Aa 字幕")).toHaveLength(
			CAPTION_STYLE_PRESETS.length
		);
	});

	it("returns the complete preset", () => {
		const onSelect = vi.fn();
		render(<CaptionPresetGrid onSelect={onSelect} />);
		const preset = CAPTION_STYLE_PRESETS[1];
		if (!preset) throw new Error("Expected a second caption preset");

		fireEvent.click(
			screen.getByRole("button", {
				name: `应用${preset.name}字幕预设`,
			})
		);

		expect(onSelect).toHaveBeenCalledWith(preset);
	});
});
