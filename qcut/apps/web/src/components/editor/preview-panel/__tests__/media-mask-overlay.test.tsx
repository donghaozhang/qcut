import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaElement, MediaMask } from "@/types/timeline";
import { MediaMaskOverlay } from "../media-mask-overlay";

function mediaElement(): MediaElement {
	return {
		id: "clip-1",
		name: "Clip",
		type: "media",
		mediaId: "media-1",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		rotation: 0,
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
	};
}

function rectangleMask(): MediaMask {
	return {
		id: "mask-1",
		name: "主体",
		type: "rectangle",
		centerX: 0.5,
		centerY: 0.5,
		width: 0.4,
		height: 0.3,
		rotation: 0,
		feather: 0.1,
		invert: false,
	};
}

describe("MediaMaskOverlay", () => {
	it("renders edge and corner resize handles for shaped masks", () => {
		render(
			<MediaMaskOverlay
				element={mediaElement()}
				trackId="track-1"
				mask={rectangleMask()}
				currentTime={1}
				fps={30}
			/>
		);

		expect(screen.getByRole("button", { name: "移动主体" })).toBeVisible();
		expect(screen.getByRole("button", { name: "旋转主体" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "左上角缩放主体" })
		).toBeVisible();
		expect(screen.getByRole("button", { name: "顶部缩放主体" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "右上角缩放主体" })
		).toBeVisible();
		expect(screen.getByRole("button", { name: "右侧缩放主体" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "右下角缩放主体" })
		).toBeVisible();
		expect(screen.getByRole("button", { name: "底部缩放主体" })).toBeVisible();
		expect(
			screen.getByRole("button", { name: "左下角缩放主体" })
		).toBeVisible();
		expect(screen.getByRole("button", { name: "左侧缩放主体" })).toBeVisible();
		expect(screen.getByTestId("media-mask-feather-outline")).toBeVisible();
		expect(
			screen
				.getByTestId("media-mask-roundness-handle")
				.querySelector("svg > title")
		).toHaveTextContent("调整圆角");
	});

	it("shows feather range handles instead of resize handles for linear masks", () => {
		render(
			<MediaMaskOverlay
				element={mediaElement()}
				trackId="track-1"
				mask={{ ...rectangleMask(), type: "linear" }}
				currentTime={1}
				fps={30}
			/>
		);

		expect(screen.queryByRole("button", { name: /缩放主体/ })).toBeNull();
		expect(screen.getByTestId("media-mask-feather-outline")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "上羽化范围主体" })
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "下羽化范围主体" })
		).toBeVisible();
	});

	it("hides the feather guide when feather is disabled", () => {
		render(
			<MediaMaskOverlay
				element={mediaElement()}
				trackId="track-1"
				mask={{ ...rectangleMask(), feather: 0 }}
				currentTime={1}
				fps={30}
			/>
		);

		expect(screen.queryByTestId("media-mask-feather-outline")).toBeNull();
	});

	it("shows an invert guide for inverted shape masks", () => {
		render(
			<MediaMaskOverlay
				element={mediaElement()}
				trackId="track-1"
				mask={{ ...rectangleMask(), invert: true }}
				currentTime={1}
				fps={30}
			/>
		);

		expect(screen.getByTestId("media-mask-invert-guide")).toBeVisible();
	});

	it("shows a mirror axis and only horizontal resize handles for mirror masks", () => {
		render(
			<MediaMaskOverlay
				element={mediaElement()}
				trackId="track-1"
				mask={{ ...rectangleMask(), type: "mirror" }}
				currentTime={1}
				fps={30}
			/>
		);

		expect(screen.getByTestId("media-mask-mirror-axis")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-active-range")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-mode-left")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-mode-center")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-mode-right")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-range-left")).toBeVisible();
		expect(screen.getByTestId("media-mask-mirror-range-right")).toBeVisible();
		expect(screen.getByRole("button", { name: "左侧缩放主体" })).toBeVisible();
		expect(screen.getByRole("button", { name: "右侧缩放主体" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "左上角缩放主体" })).toBeNull();
		expect(screen.queryByRole("button", { name: "顶部缩放主体" })).toBeNull();
		expect(screen.queryByRole("button", { name: "右下角缩放主体" })).toBeNull();
	});
});
