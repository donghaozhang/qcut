import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformAgentPointerVisualState } from "@qcut/platform-core";
import { AgentPointerOverlay } from "../agent-pointer-overlay";

const pointerBridge = vi.hoisted(() => {
	let callback: ((state: PlatformAgentPointerVisualState) => void) | undefined;
	return {
		onStateChange: vi.fn(
			(nextCallback: (state: PlatformAgentPointerVisualState) => void) => {
				callback = nextCallback;
			}
		),
		removeListeners: vi.fn(),
		emit: (state: PlatformAgentPointerVisualState) => callback?.(state),
	};
});

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({ claude: { pointer: pointerBridge } }),
}));

function pointerState({
	overrides = {},
}: {
	overrides?: Partial<PlatformAgentPointerVisualState>;
} = {}): PlatformAgentPointerVisualState {
	return {
		visible: true,
		active: true,
		action: "move",
		label: "移动光标",
		x: 120,
		y: 240,
		pressed: false,
		dragging: false,
		button: null,
		inputMode: "background",
		pulseId: 0,
		sequence: 1,
		timestamp: 1,
		...overrides,
	};
}

describe("AgentPointerOverlay", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows the pointer, action status, and click feedback", () => {
		render(<AgentPointerOverlay />);

		act(() => {
			pointerBridge.emit(
				pointerState({
					overrides: { action: "click", label: "点击", pulseId: 1 },
				})
			);
		});

		expect(screen.getByTestId("agent-pointer-overlay")).toHaveAttribute(
			"data-qcut-snapshot-ignore",
			"true"
		);
		expect(screen.getByTestId("agent-pointer-cursor")).toBeInTheDocument();
		expect(screen.getByText("Agent 后台操作")).toBeInTheDocument();
		expect(screen.getByText("点击")).toBeInTheDocument();
	});

	it("labels explicit foreground input", () => {
		render(<AgentPointerOverlay />);

		act(() => {
			pointerBridge.emit(
				pointerState({ overrides: { inputMode: "foreground" } })
			);
		});

		expect(screen.getByText("Agent 正在操作")).toBeInTheDocument();
	});

	it("draws a drag trail and removes the overlay when hidden", () => {
		const { container } = render(<AgentPointerOverlay />);

		act(() => {
			pointerBridge.emit(
				pointerState({
					overrides: { action: "drag", dragging: true, x: 100, y: 600 },
				})
			);
			pointerBridge.emit(
				pointerState({
					overrides: {
						action: "drag",
						dragging: true,
						x: 500,
						y: 600,
						sequence: 2,
					},
				})
			);
		});

		expect(container.querySelector("polyline")).toHaveAttribute(
			"points",
			"100,600 500,600"
		);

		act(() => {
			pointerBridge.emit(
				pointerState({
					overrides: {
						action: "hidden",
						active: false,
						visible: false,
					},
				})
			);
		});
		expect(screen.queryByTestId("agent-pointer-overlay")).toBeNull();

		act(() => {
			pointerBridge.emit(pointerState());
		});
		expect(container.querySelector("polyline")).toBeNull();
	});
});
