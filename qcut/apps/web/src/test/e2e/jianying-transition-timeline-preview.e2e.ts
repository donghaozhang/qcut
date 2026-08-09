import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { JIANYING_TRANSITIONS } from "../../../../../electron/jianying-transition-catalog";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const transition = JIANYING_TRANSITIONS.find(
	(candidate) => candidate.id === "jianying-local-3d-space"
);
if (!transition) throw new Error("Missing 3D Space transition metadata");

interface ExposedEditorWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				type: string;
				isMain?: boolean;
				transitions?: Array<{
					engine?: string;
					presetId: string;
					packageHash?: string;
				}>;
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
				videoMediaIds: ReadonlySet<string>;
				presetId: string;
				engine: "jianying-local";
				packageHash: string;
				type: "glass-refraction";
				duration: number;
				easing: "easeInOut";
			}) => string | null;
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
}

async function createLocalTransition({
	page,
}: {
	page: Page;
}): Promise<number> {
	return page.evaluate(
		({ presetId, packageHash }) => {
			const editorWindow = window as unknown as ExposedEditorWindow;
			const media = editorWindow.__mediaStore.getState().mediaItems[0];
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!media || !track)
				throw new Error("Missing test media or media track");
			const clipDuration = Math.min(2, media.duration ?? 2);
			const fromElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: `${media.name} A`,
				duration: clipDuration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			});
			const toElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: `${media.name} B`,
				duration: clipDuration,
				startTime: clipDuration,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!fromElementId || !toElementId) {
				throw new Error("Failed to create adjacent test clips");
			}
			const transitionId = timeline.addTransition({
				trackId: track.id,
				fromElementId,
				toElementId,
				videoMediaIds: new Set([media.id]),
				presetId,
				engine: "jianying-local",
				packageHash,
				type: "glass-refraction",
				duration: 1,
				easing: "easeInOut",
			});
			if (!transitionId) throw new Error("Failed to add local transition");
			editorWindow.__playbackStore.getState().seek(clipDuration);
			return clipDuration;
		},
		{ presetId: transition.id, packageHash: transition.metadataMd5 }
	);
}

test("renders a real local Jianying transition proxy on the timeline", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await createTestProject(page, "Jianying Timeline Preview E2E");
	await importTestVideo(page);
	const cutTime = await createLocalTransition({ page });

	const overlay = page.getByTestId("jianying-timeline-transition-preview");
	await expect(overlay).toBeVisible({ timeout: 180_000 });
	const previewState = await overlay.evaluate((video: HTMLVideoElement) => ({
		source: video.currentSrc,
		duration: video.duration,
		muted: video.muted,
		readyState: video.readyState,
	}));
	expect(previewState.source).toContain("app://jianying-transition-preview/");
	expect(previewState.duration).toBeCloseTo(1, 1);
	expect(previewState.muted).toBe(true);
	expect(previewState.readyState).toBeGreaterThanOrEqual(1);

	const serializedTransitions = await page.evaluate(() => {
		const editorWindow = window as unknown as ExposedEditorWindow;
		const transitions = editorWindow.__timelineStore
			.getState()
			.tracks.flatMap((track) => track.transitions ?? []);
		return JSON.stringify(transitions);
	});
	expect(serializedTransitions).toContain('"engine":"jianying-local"');
	expect(serializedTransitions).toContain(
		`"packageHash":"${transition.metadataMd5}"`
	);
	expect(serializedTransitions).not.toContain("inputPath");

	const screenshotDirectory = path.resolve(
		process.cwd(),
		"output/playwright/transition-lab"
	);
	await mkdir(screenshotDirectory, { recursive: true });
	await page.screenshot({
		path: path.join(screenshotDirectory, "jianying-timeline-preview.png"),
		animations: "disabled",
	});
	expect(cutTime).toBeGreaterThan(0);
});
