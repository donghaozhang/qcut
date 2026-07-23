import { afterEach, describe, expect, it } from "vitest";
import { buildPreviewStateSnapshot } from "../claude-preview-state";

function mountPreview({
	presentedFrames,
	loading = false,
}: {
	presentedFrames: number;
	loading?: boolean;
}): void {
	document.body.innerHTML = `
		<div data-testid="preview-panel">
			<div data-testid="preview-canvas">
				<video
					data-video-id="video-1"
					data-qcut-presented-frames="${presentedFrames}"
					data-qcut-presented-at="100"
				></video>
				${
					loading
						? '<div data-testid="native-composition-preview-loading"></div>'
						: ""
				}
			</div>
		</div>
	`;
	const video = document.querySelector("video");
	if (!video) throw new Error("Video fixture was not mounted");
	Object.defineProperties(video, {
		readyState: { configurable: true, value: 2 },
		videoWidth: { configurable: true, value: 1920 },
		videoHeight: { configurable: true, value: 1080 },
		currentTime: { configurable: true, value: 0 },
	});
}

function buildState() {
	return buildPreviewStateSnapshot({
		tracks: [
			{
				id: "track-1",
				name: "Main",
				type: "media",
				elements: [
					{
						id: "element-1",
						type: "media",
						mediaId: "video-1",
						startTime: 0,
						duration: 10,
					},
				],
			},
		],
		mediaItems: [{ id: "video-1", name: "Demo", type: "video" }],
		currentTime: 0,
		editorReady: true,
	});
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("Claude preview state", () => {
	it("reports ready only after an active video has presented a frame", () => {
		mountPreview({ presentedFrames: 1 });

		const state = buildState();

		expect(state.ready).toBe(true);
		expect(state.activeVideoMediaIds).toEqual(["video-1"]);
		expect(state.lastPresentedAt).toBe(100);
	});

	it("does not confuse loaded metadata with a presented frame", () => {
		mountPreview({ presentedFrames: 0 });

		const state = buildState();

		expect(state.ready).toBe(false);
		expect(state.reason).toBe("active-video-frame-not-ready:video-1");
	});

	it("waits while an exact composition frame is rendering", () => {
		mountPreview({ presentedFrames: 1, loading: true });

		const state = buildState();

		expect(state.ready).toBe(false);
		expect(state.reason).toBe("native-composition-rendering");
	});
});
