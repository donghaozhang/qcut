import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverSourceStrip } from "./cover-source-strip";

const mocks = vi.hoisted(() => ({
	capture: vi.fn(),
	duration: 3,
	loading: false,
}));
vi.mock("@/lib/export/export-still-frame", () => ({
	captureStillFrame: mocks.capture,
}));
vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: (
		selector: (state: { getTotalDuration: () => number }) => number
	) => selector({ getTotalDuration: () => mocks.duration }),
}));
vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: { getState: () => ({ currentTime: 0 }) },
}));
vi.mock("@/stores/media-store", () => ({
	useMediaStore: (selector: (state: { isLoading: boolean }) => boolean) =>
		selector({ isLoading: mocks.loading }),
}));
vi.mock("@/lib/i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const close = vi.fn();
const onChoose = vi.fn().mockResolvedValue(undefined);
const props = {
	projectId: "filmstrip-test",
	fps: 30,
	disabled: false,
	onChoose,
};
const success = {
	ok: true,
	projectId: props.projectId,
	blob: new Blob(["frame"]),
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.duration = 3;
	mocks.loading = false;
	mocks.capture.mockResolvedValue(success);
	vi.stubGlobal(
		"createImageBitmap",
		vi.fn().mockResolvedValue({ width: 1920, height: 1080, close })
	);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: vi.fn(),
	} as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
	vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
		(callback) => callback(new Blob(["thumbnail"], { type: "image/webp" }))
	);
	vi.spyOn(URL, "createObjectURL").mockImplementation(
		() => `blob:frame-${mocks.capture.mock.calls.length}`
	);
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("cover real frame strip", () => {
	it("opens after the timeline restores without overriding a manual collapse", async () => {
		mocks.duration = 0;
		mocks.loading = true;
		const view = render(<CoverSourceStrip {...props} />);
		expect(screen.queryByTestId("cover-filmstrip")).toBeNull();
		mocks.duration = 3;
		view.rerender(<CoverSourceStrip {...props} />);
		expect(screen.getByTestId("cover-filmstrip")).toHaveAttribute(
			"aria-busy",
			"true"
		);
		expect(mocks.capture).not.toHaveBeenCalled();
		mocks.loading = false;
		view.rerender(<CoverSourceStrip {...props} />);
		await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(10));
		fireEvent.click(screen.getByTestId("cover-frames"));
		mocks.duration = 5;
		view.rerender(<CoverSourceStrip {...props} />);
		expect(screen.queryByTestId("cover-filmstrip")).toBeNull();
	});
	it("opens with ten bounded real frames without changing the chosen cover", async () => {
		const view = render(<CoverSourceStrip {...props} />);
		const strip = screen.getByRole("group", { name: "editor.cover.frames" });
		expect(within(strip).getAllByRole("button")).toHaveLength(10);
		await waitFor(() => expect(strip.querySelectorAll("img")).toHaveLength(10));
		expect(
			mocks.capture.mock.calls.map(([request]) => request.timeSeconds)
		).toEqual([
			0,
			10 / 30,
			20 / 30,
			1,
			40 / 30,
			49 / 30,
			59 / 30,
			69 / 30,
			79 / 30,
			89 / 30,
		]);
		expect(onChoose).not.toHaveBeenCalled();
		fireEvent.click(within(strip).getAllByRole("button")[9]);
		expect(onChoose).toHaveBeenCalledExactlyOnceWith({ timeSeconds: 89 / 30 });
		view.unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(10);
		expect(close).toHaveBeenCalledTimes(10);
	});
	it("waits for project media and hides revoked thumbnails during a reload", async () => {
		mocks.loading = true;
		const view = render(<CoverSourceStrip {...props} />);
		expect(mocks.capture).not.toHaveBeenCalled();
		expect(screen.getByTestId("cover-filmstrip")).toHaveAttribute(
			"aria-busy",
			"true"
		);
		mocks.loading = false;
		view.rerender(<CoverSourceStrip {...props} />);
		await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(10));
		await waitFor(() =>
			expect(
				screen.getByTestId("cover-filmstrip").querySelectorAll("img")
			).toHaveLength(10)
		);
		mocks.loading = true;
		view.rerender(<CoverSourceStrip {...props} />);
		expect(
			screen.getByTestId("cover-filmstrip").querySelector("img")
		).toBeNull();
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(10);
	});
	it("deduplicates frames in a one-frame project and keeps empty projects collapsed", async () => {
		mocks.duration = 1 / 30;
		const view = render(<CoverSourceStrip {...props} />);
		await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());
		expect(
			within(screen.getByTestId("cover-filmstrip")).getAllByRole("button")
		).toHaveLength(1);
		view.unmount();
		mocks.duration = 0;
		render(<CoverSourceStrip {...props} />);
		expect(screen.queryByTestId("cover-filmstrip")).toBeNull();
	});
	it("does not display another project's frames", async () => {
		mocks.capture.mockResolvedValue({ ...success, projectId: "other" });
		render(<CoverSourceStrip {...props} />);
		await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(10));
		expect(
			screen.getByTestId("cover-filmstrip").querySelector("img")
		).toBeNull();
		expect(createImageBitmap).not.toHaveBeenCalled();
	});
	it("cancels remaining captures when collapsed before capture completes", async () => {
		let resolve: (value: typeof success) => void = () => {};
		mocks.capture.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		render(<CoverSourceStrip {...props} />);
		await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());
		fireEvent.click(screen.getByTestId("cover-frames"));
		await act(async () => resolve(success));
		expect(mocks.capture).toHaveBeenCalledOnce();
		expect(createImageBitmap).not.toHaveBeenCalled();
	});
	it("stops on thumbnail encoding failure and leaves slots disabled", async () => {
		vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(
			(callback) => callback(null)
		);
		render(<CoverSourceStrip {...props} />);
		await waitFor(() =>
			expect(screen.getByTestId("cover-filmstrip")).toHaveAttribute(
				"aria-busy",
				"false"
			)
		);
		expect(mocks.capture).toHaveBeenCalledOnce();
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledOnce();
		for (const button of within(
			screen.getByTestId("cover-filmstrip")
		).getAllByRole("button"))
			expect(button).toBeDisabled();
	});
});
