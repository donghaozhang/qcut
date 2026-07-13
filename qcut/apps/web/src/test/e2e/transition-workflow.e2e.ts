import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const screenshotPath = path.resolve(
	process.cwd(),
	"output/playwright/qcut-transition-electron-e2e.png"
);

interface ExposedMediaState {
	mediaItems: Array<{
		id: string;
		name: string;
		duration?: number;
	}>;
}

interface ExposedTimelineState {
	tracks: Array<{
		id: string;
		type: string;
		isMain?: boolean;
		elements: Array<{ id: string; startTime: number }>;
		transitions?: Array<{
			id: string;
			presetId: string;
			type: string;
			direction?: string;
			duration: number;
			easing: string;
		}>;
		audioCrossfades?: Array<{ duration: number; curve: string }>;
	}>;
	addElementToTrack: (
		trackId: string,
		element: {
			type: "media";
			mediaId: string;
			name: string;
			duration: number;
			startTime: number;
			trimStart: number;
			trimEnd: number;
		}
	) => string | null;
	addTransition: (input: {
		trackId: string;
		fromElementId: string;
		toElementId: string;
		presetId: string;
		type: "dissolve";
		duration: number;
		easing: "easeInOut";
	}) => string | null;
	setSelectedElements: (
		elements: Array<{ trackId: string; elementId: string }>
	) => void;
}

interface ExposedPlaybackState {
	seek: (time: number) => void;
}

interface ExposedEditorWindow extends Window {
	__mediaStore: { getState: () => ExposedMediaState };
	__timelineStore: { getState: () => ExposedTimelineState };
	__playbackStore: { getState: () => ExposedPlaybackState };
}

async function seek({ page, time }: { page: Page; time: number }) {
	await page.evaluate(
		({ nextTime }) => {
			const editorWindow = window as unknown as ExposedEditorWindow;
			editorWindow.__playbackStore.getState().seek(nextTime);
		},
		{ nextTime: time }
	);
}

test.describe("Clip transition workflow", () => {
	test("previews a real transition without revoking its shared media URL", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const lifecycleErrors: string[] = [];
		const captureLifecycleError = ({ message }: { message: string }) => {
			if (/ERR_FILE_NOT_FOUND|ERR_UPLOAD_FILE_CHANGED/i.test(message)) {
				lifecycleErrors.push(message);
			}
		};
		page.on("console", (message) =>
			captureLifecycleError({ message: message.text() })
		);
		page.on("pageerror", (error) =>
			captureLifecycleError({ message: error.message })
		);
		page.on("requestfailed", (request) => {
			if (request.url().startsWith("blob:")) {
				lifecycleErrors.push(
					`${request.url()}: ${request.failure()?.errorText ?? "request failed"}`
				);
			}
		});

		await createTestProject(page, "Transition Lifecycle E2E");
		await importTestVideo(page);
		const transitionId = await page.evaluate(() => {
			const editorWindow = window as unknown as ExposedEditorWindow;
			const media = editorWindow.__mediaStore.getState().mediaItems[0];
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!media || !track)
				throw new Error("Missing imported media or main track");
			const clipDuration = Math.min(2, media.duration ?? 2);
			const fromElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: media.name,
				duration: clipDuration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			});
			const toElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: media.name,
				duration: clipDuration,
				startTime: clipDuration,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!fromElementId || !toElementId) {
				throw new Error("Failed to create transition clips");
			}
			const id = editorWindow.__timelineStore.getState().addTransition({
				trackId: track.id,
				fromElementId,
				toElementId,
				presetId: "dissolve",
				type: "dissolve",
				duration: 1,
				easing: "easeInOut",
			});
			if (!id) throw new Error("Failed to create transition");
			return id;
		});

		const marker = page.getByTestId(`timeline-transition-${transitionId}`);
		await expect(marker).toBeVisible();
		await seek({ page, time: 2 });
		const previewVideos = page.getByTestId("preview-panel").locator("video");
		await expect.poll(() => previewVideos.count()).toBeGreaterThanOrEqual(2);
		const seamSources = await previewVideos.evaluateAll((videos) =>
			videos.map((video) => (video as HTMLVideoElement).currentSrc)
		);
		expect(seamSources.every((source) => source.startsWith("blob:"))).toBe(
			true
		);
		expect(new Set(seamSources).size).toBe(1);

		for (let round = 0; round < 3; round += 1) {
			await seek({ page, time: 4 });
			await expect(previewVideos).toHaveCount(0);
			await page.waitForTimeout(150);
			await seek({ page, time: 0.5 });
			await expect(previewVideos).toHaveCount(1);
			await expect
				.poll(() =>
					previewVideos
						.first()
						.evaluate(
							(video: HTMLVideoElement, { expectedSource }) =>
								video.currentSrc === expectedSource && video.readyState >= 1,
							{ expectedSource: seamSources[0] }
						)
				)
				.toBe(true);
		}

		await page.getByTestId("transitions-panel-tab").click();
		await expect(page.getByTestId("transition-card-dissolve")).toBeVisible();
		await page.evaluate(() => {
			const editorWindow = window as unknown as ExposedEditorWindow;
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track || track.elements.length < 2) {
				throw new Error("Missing adjacent transition clips");
			}
			timeline.setSelectedElements(
				track.elements.slice(0, 2).map((element) => ({
					trackId: track.id,
					elementId: element.id,
				}))
			);
		});
		await page.getByTestId("transition-card-whip-pan-left").dblclick();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const editorWindow = window as unknown as ExposedEditorWindow;
					return editorWindow.__timelineStore
						.getState()
						.tracks.flatMap((track) => track.transitions ?? [])[0];
				})
			)
			.toMatchObject({
				id: transitionId,
				presetId: "whip-pan-left",
				type: "whip-pan",
				direction: "left",
			});
		await marker.click();
		await expect(page.getByLabel("转场时长（秒）")).toHaveValue("0.4");
		await page.getByLabel("转场时长（秒）").fill("0.7");
		await page.getByLabel("转场时长（秒）").press("Enter");
		await page.getByLabel("转场方向").click();
		await page.getByRole("option", { name: "向右" }).click();
		await page.getByLabel("转场缓动").click();
		await page.getByRole("option", { name: "线性" }).click();
		await page.getByLabel("转场音频").click();
		await page.getByRole("option", { name: "等功率交叉淡化" }).click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const editorWindow = window as unknown as ExposedEditorWindow;
					const track = editorWindow.__timelineStore.getState().tracks[0];
					return {
						transition: track.transitions?.[0],
						audioCrossfade: track.audioCrossfades?.[0],
					};
				})
			)
			.toMatchObject({
				transition: {
					duration: 0.7,
					direction: "right",
					easing: "linear",
				},
				audioCrossfade: { duration: 0.7, curve: "equal-power" },
			});
		await seek({ page, time: 2 });
		await expect.poll(() => previewVideos.count()).toBeGreaterThanOrEqual(2);
		await page.waitForTimeout(250);

		await mkdir(path.dirname(screenshotPath), { recursive: true });
		await page.screenshot({ path: screenshotPath, animations: "disabled" });
		await page.getByRole("button", { name: "删除转场" }).click();
		await expect(marker).toHaveCount(0);
		await page.waitForTimeout(1100);
		expect(lifecycleErrors).toEqual([]);
	});
});
