import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_ENHANCEMENTS } from "@/lib/video/video-properties";
import { MediaLabProperties } from "../media-lab-properties";

function renderLab({
	hasLocalTracking = false,
	privateDeflickerEnabled = false,
}: {
	hasLocalTracking?: boolean;
	privateDeflickerEnabled?: boolean;
} = {}) {
	const onChange = vi.fn();
	const onApplySmartAction = vi.fn();
	const onApplyPrivateDeflicker = vi.fn();
	render(
		<MediaLabProperties
			enhancements={DEFAULT_MEDIA_ENHANCEMENTS}
			hasLocalTracking={hasLocalTracking}
			privateDeflickerBusy={false}
			privateDeflickerEnabled={privateDeflickerEnabled}
			onChange={onChange}
			onApplyPrivateDeflicker={onApplyPrivateDeflicker}
			onApplySmartAction={onApplySmartAction}
			onInteractionStart={vi.fn()}
			onInteractionEnd={vi.fn()}
		/>
	);
	return { onApplyPrivateDeflicker, onApplySmartAction, onChange };
}

describe("MediaLabProperties", () => {
	it("renders every experimental local entry with an explicit lab prefix", () => {
		renderLab();

		for (const label of [
			"实验室防闪烁",
			"实验室光流运动模糊",
			"实验室智能运镜",
			"实验室智能裁剪",
			"实验室镜头追踪",
			"实验室眼神修正",
			"实验室本地超分",
		]) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
	});

	it("persists local filter strength without recording every slider tick", () => {
		const { onChange } = renderLab();

		fireEvent.change(screen.getByRole("spinbutton", { name: /实验室防闪烁/ }), {
			target: { value: "45" },
		});

		expect(onChange).toHaveBeenCalledWith(
			{ ...DEFAULT_MEDIA_ENHANCEMENTS, labDeflicker: 45 },
			false
		);
	});

	it("requires a completed local track before applying smart tools", () => {
		renderLab();

		expect(
			screen.getByRole("button", { name: "实验室智能运镜" })
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "实验室智能裁剪" })
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "实验室镜头追踪" })
		).toBeDisabled();
	});

	it("runs the verified private-cache action only after strength is enabled", () => {
		const { onApplyPrivateDeflicker } = renderLab({
			privateDeflickerEnabled: true,
		});
		const action = screen.getByRole("button", {
			name: "使用本机剪映缓存处理",
		});

		fireEvent.keyDown(action, { key: "Enter" });
		expect(onApplyPrivateDeflicker).not.toHaveBeenCalled();
		fireEvent.click(action);

		expect(onApplyPrivateDeflicker).toHaveBeenCalledOnce();
	});

	it("dispatches each smart tool against a ready local track", () => {
		const { onApplySmartAction } = renderLab({ hasLocalTracking: true });

		fireEvent.click(screen.getByRole("button", { name: "实验室智能运镜" }));
		fireEvent.click(screen.getByRole("button", { name: "实验室智能裁剪" }));
		fireEvent.click(screen.getByRole("button", { name: "实验室镜头追踪" }));

		expect(onApplySmartAction.mock.calls).toEqual([
			[{ action: "smart-motion" }],
			[{ action: "smart-crop" }],
			[{ action: "camera-tracking" }],
		]);
	});
});
