import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_ENHANCEMENTS } from "@/lib/video/video-properties";
import {
	DEFAULT_DENOISE_STRENGTH,
	DenoiseSection,
	QUICK_ENHANCE_CLARITY,
	QuickEnhanceSection,
	StabilizationSection,
	SuperResolutionSection,
} from "../media-enhancement-sections";

describe("enhancement sections", () => {
	it("switches stabilization on at the recommended level and off to zero", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<StabilizationSection
				enhancements={DEFAULT_MEDIA_ENHANCEMENTS}
				onChange={onChange}
			/>
		);
		const checkbox = screen.getByLabelText("启用视频防抖");
		expect(checkbox).toHaveAttribute("data-state", "unchecked");
		fireEvent.click(checkbox);
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ stabilization: 50 })
		);

		rerender(
			<StabilizationSection
				enhancements={{ ...DEFAULT_MEDIA_ENHANCEMENTS, stabilization: 75 }}
				onChange={onChange}
			/>
		);
		expect(screen.getByLabelText("启用视频防抖")).toHaveAttribute(
			"data-state",
			"checked"
		);
		fireEvent.click(screen.getByLabelText("启用视频防抖"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ stabilization: 0 })
		);
		fireEvent.click(screen.getByLabelText("重置视频防抖"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ stabilization: 0 })
		);
	});

	it("binds one-click enhance to the local clarity filter", () => {
		const onChange = vi.fn();
		render(
			<QuickEnhanceSection
				enhancements={DEFAULT_MEDIA_ENHANCEMENTS}
				onChange={onChange}
			/>
		);
		fireEvent.click(screen.getByLabelText("启用一键画质提升"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ clarity: QUICK_ENHANCE_CLARITY })
		);
	});

	it("turns super resolution on as local 2x and exposes the cloud entry point", () => {
		const onChange = vi.fn();
		const onOpenAIUpscale = vi.fn();
		render(
			<SuperResolutionSection
				enhancements={{ ...DEFAULT_MEDIA_ENHANCEMENTS, upscale: 4 }}
				onChange={onChange}
				onOpenAIUpscale={onOpenAIUpscale}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "超清画质" }));
		fireEvent.click(screen.getByRole("button", { name: "AI 超分（云端）" }));
		expect(onOpenAIUpscale).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByLabelText("启用超清画质"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ upscale: 1 })
		);
	});

	it("switches super resolution on as local 2x and keeps the cloud button reachable while off", () => {
		const onChange = vi.fn();
		const onOpenAIUpscale = vi.fn();
		render(
			<SuperResolutionSection
				enhancements={DEFAULT_MEDIA_ENHANCEMENTS}
				onChange={onChange}
				onOpenAIUpscale={onOpenAIUpscale}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "AI 超分（云端）" }));
		expect(onOpenAIUpscale).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByLabelText("启用超清画质"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ upscale: 2 })
		);
	});

	it("starts denoise at its default strength and streams slider edits live", () => {
		const onChange = vi.fn();
		render(
			<DenoiseSection
				enhancements={DEFAULT_MEDIA_ENHANCEMENTS}
				onChange={onChange}
				onInteractionStart={vi.fn()}
				onInteractionEnd={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByLabelText("启用画面降噪"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ denoise: DEFAULT_DENOISE_STRENGTH })
		);
		fireEvent.click(screen.getByRole("button", { name: "画面降噪" }));
		fireEvent.change(screen.getByLabelText("强度数值"), {
			target: { value: "45" },
		});
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ denoise: 45 }),
			false
		);
	});
});
