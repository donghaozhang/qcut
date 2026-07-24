import { act, render, screen, waitFor } from "@/test/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperframesElement } from "@/types/timeline";
import { HyperframesPreview } from "../hyperframes-preview";

const mocks = vi.hoisted(() => ({
	hasCapability: vi.fn(() => true),
	registerPreview: vi.fn(),
	releasePreview: vi.fn(async () => ({ success: true })),
	updateHyperframesElement: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	PlatformCapability: { Hyperframes: "hyperframes" },
	platform: () => ({
		hasCapability: mocks.hasCapability,
		hyperframes: {
			registerPreview: mocks.registerPreview,
			releasePreview: mocks.releasePreview,
		},
	}),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: <T,>(
		selector: (state: {
			updateHyperframesElement: typeof mocks.updateHyperframesElement;
		}) => T
	): T =>
		selector({
			updateHyperframesElement: mocks.updateHyperframesElement,
		}),
}));

function createElement({
	variableValues = { title: "Hello" },
	durationIsEstimated,
}: {
	variableValues?: HyperframesElement["variableValues"];
	durationIsEstimated?: boolean;
} = {}): HyperframesElement {
	return {
		id: "hyperframes-1",
		type: "hyperframes",
		name: "Title card",
		duration: 8,
		startTime: 1,
		trimStart: 0.5,
		trimEnd: 1,
		compositionId: "main",
		sourcePath: "/project/index.html",
		projectPath: "/project",
		compositionWidth: 1920,
		compositionHeight: 1080,
		fps: 30,
		durationIsEstimated,
		variableValues,
		variableDefinitions: [],
		renderMode: "live",
	};
}

function attachRuntimeWindow({ iframe }: { iframe: HTMLIFrameElement }): {
	runtimeWindow: Window;
	postMessage: ReturnType<typeof vi.fn>;
} {
	const postMessage = vi.fn();
	const runtimeWindow = { postMessage } as unknown as Window;
	Object.defineProperty(iframe, "contentWindow", {
		configurable: true,
		value: runtimeWindow,
	});
	return { runtimeWindow, postMessage };
}

function dispatchRuntimeMessage({
	source,
	type,
	duration,
}: {
	source: Window;
	type: "ready" | "error";
	duration?: number;
}): void {
	window.dispatchEvent(
		new MessageEvent("message", {
			source,
			data: {
				source: "qcut-hyperframes-runtime",
				type,
				duration,
			},
		})
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasCapability.mockReturnValue(true);
	mocks.registerPreview.mockResolvedValue({
		success: true,
		url: "qcut-hyperframes://preview-token/index.html",
		token: "preview-token",
	});
});

describe("HyperframesPreview", () => {
	it("registers a sandboxed preview and releases its session on unmount", async () => {
		const element = createElement();
		const { unmount } = render(
			<HyperframesPreview
				element={element}
				trackId="hyperframes-track"
				currentTime={2}
				isPlaying={false}
				muted={false}
				width={1280}
				height={720}
			/>
		);

		const iframe = await screen.findByTitle("Title card HyperFrames preview");
		expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
		expect(iframe).toHaveAttribute("allow", "autoplay");
		expect(mocks.registerPreview).toHaveBeenCalledWith({
			sourcePath: "/project/index.html",
			variables: { title: "Hello" },
		});

		unmount();
		await waitFor(() =>
			expect(mocks.releasePreview).toHaveBeenCalledWith("preview-token")
		);
	});

	it("accepts readiness only from its iframe and seeks using timeline trims", async () => {
		const element = createElement();
		render(
			<HyperframesPreview
				element={element}
				trackId="hyperframes-track"
				currentTime={3}
				isPlaying={true}
				muted={true}
				width={1280}
				height={720}
			/>
		);

		const iframe = (await screen.findByTitle(
			"Title card HyperFrames preview"
		)) as HTMLIFrameElement;
		const { runtimeWindow, postMessage } = attachRuntimeWindow({ iframe });

		act(() => {
			dispatchRuntimeMessage({
				source: {} as Window,
				type: "ready",
			});
		});
		expect(postMessage).not.toHaveBeenCalled();

		act(() => {
			dispatchRuntimeMessage({ source: runtimeWindow, type: "ready" });
		});

		await waitFor(() => {
			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					source: "qcut-hyperframes",
					type: "seek",
					time: 2.5,
				}),
				"*"
			);
			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					source: "qcut-hyperframes",
					type: "play",
				}),
				"*"
			);
			expect(postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					source: "qcut-hyperframes",
					type: "set-muted",
					muted: true,
				}),
				"*"
			);
		});
	});

	it("persists a runtime-confirmed duration without adding undo history", async () => {
		const element = createElement({ durationIsEstimated: true });
		render(
			<HyperframesPreview
				element={element}
				trackId="hyperframes-track"
				currentTime={1}
				isPlaying={false}
				muted={false}
				width={1280}
				height={720}
			/>
		);

		const iframe = (await screen.findByTitle(
			"Title card HyperFrames preview"
		)) as HTMLIFrameElement;
		const { runtimeWindow } = attachRuntimeWindow({ iframe });

		act(() => {
			dispatchRuntimeMessage({
				source: runtimeWindow,
				type: "ready",
				duration: 12.5,
			});
		});

		expect(mocks.updateHyperframesElement).toHaveBeenCalledWith(
			"hyperframes-track",
			"hyperframes-1",
			{
				duration: 12.5,
				durationIsEstimated: false,
				trimStart: 0.5,
				trimEnd: 1,
			},
			false
		);
	});

	it("shows a desktop requirement without registering on unsupported platforms", async () => {
		mocks.hasCapability.mockReturnValue(false);

		render(
			<HyperframesPreview
				element={createElement()}
				trackId="hyperframes-track"
				currentTime={0}
				isPlaying={false}
				muted={false}
				width={1280}
				height={720}
			/>
		);

		expect(
			await screen.findByText(
				"HyperFrames preview is available in the desktop app."
			)
		).toBeInTheDocument();
		expect(mocks.registerPreview).not.toHaveBeenCalled();
	});
});
