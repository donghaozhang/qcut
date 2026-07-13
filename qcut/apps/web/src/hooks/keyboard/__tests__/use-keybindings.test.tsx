import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKeybindingsStore } from "@/stores/editor/keybindings-store";
import { useKeybindingsListener } from "../use-keybindings";

const actionMocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/constants/actions", () => ({
	invokeAction: actionMocks.invoke,
}));

function KeybindingHarness({ consumeArrowKey }: { consumeArrowKey: boolean }) {
	useKeybindingsListener();
	return (
		<button
			type="button"
			onKeyDown={(event) => {
				if (consumeArrowKey) event.preventDefault();
			}}
		>
			Canvas handle
		</button>
	);
}

describe("useKeybindingsListener", () => {
	beforeEach(() => {
		actionMocks.invoke.mockReset();
		useKeybindingsStore.getState().resetToDefaults();
		useKeybindingsStore.getState().enableKeybindings();
		useKeybindingsStore.getState().setIsRecording(false);
	});

	it("ignores a shortcut already consumed by a focused control", () => {
		const { getByRole } = render(<KeybindingHarness consumeArrowKey={true} />);

		fireEvent.keyDown(getByRole("button"), {
			key: "ArrowRight",
			shiftKey: true,
		});

		expect(actionMocks.invoke).not.toHaveBeenCalled();
	});

	it("keeps unhandled global shortcuts active", () => {
		const { getByRole } = render(<KeybindingHarness consumeArrowKey={false} />);

		fireEvent.keyDown(getByRole("button"), {
			key: "ArrowRight",
			shiftKey: true,
		});

		expect(actionMocks.invoke).toHaveBeenCalledWith(
			"jump-forward",
			{ seconds: 5 },
			"keypress"
		);
	});
});
