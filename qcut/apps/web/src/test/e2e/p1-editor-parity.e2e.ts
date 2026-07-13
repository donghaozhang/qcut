import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	createTestProject,
	expect,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const realVideoPath = process.env.QCUT_REAL_VIDEO_PATH ?? "";
const artifactDirectory = path.resolve(
	process.cwd(),
	"output/playwright/qcut-p1-editor-parity"
);

interface EditorMediaState {
	mediaItems: Array<{
		id: string;
		name: string;
		duration?: number;
	}>;
}

interface EditorTimelineState {
	tracks: Array<{
		id: string;
		type: string;
		isMain?: boolean;
		elements: Array<{ id: string }>;
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
	setSelectedElements: (
		selection: Array<{ trackId: string; elementId: string }>
	) => void;
	updateMediaElement: (
		trackId: string,
		elementId: string,
		updates: Record<string, unknown>
	) => void;
	autoShowEffectsTrack: () => void;
}

interface EditorPlaybackState {
	seek: (time: number) => void;
}

interface EditorWindow extends Window {
	__mediaStore: { getState: () => EditorMediaState };
	__timelineStore: { getState: () => EditorTimelineState };
	__playbackStore: { getState: () => EditorPlaybackState };
}

test.skip(
	!realVideoPath || !existsSync(realVideoPath),
	"Set QCUT_REAL_VIDEO_PATH to a local video for P1 parity validation"
);

test.describe("P1 editor parity with real video", () => {
	test("renders the standard workspace, real effects, cutout, and timeline states", async ({
		page,
		electronApp,
	}) => {
		test.setTimeout(180_000);
		await mkdir(artifactDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await createTestProject(page, "P1 Real Video Parity");
		await uploadTestMedia(page, realVideoPath);
		await expect(page.getByTestId("media-item").first()).toBeVisible();

		const clips = await page.evaluate(() => {
			const editorWindow = window as unknown as EditorWindow;
			const media = editorWindow.__mediaStore.getState().mediaItems[0];
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!media || !track) throw new Error("Expected imported real video");
			const clipDuration = Math.min(3, media.duration ?? 3);
			const firstId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: media.name,
				duration: clipDuration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			});
			const secondId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: media.id,
				name: `${media.name} B`,
				duration: clipDuration,
				startTime: clipDuration,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!firstId || !secondId) throw new Error("Failed to create real clips");
			timeline.setSelectedElements([{ trackId: track.id, elementId: firstId }]);
			return { trackId: track.id, firstId, secondId, clipDuration };
		});

		const navigation = page.getByTestId("standard-editor-navigation");
		await expect(navigation.getByRole("button")).toHaveCount(11);
		for (const label of [
			"Media",
			"Audio",
			"Text",
			"Stickers",
			"Effects",
			"Transitions",
			"Captions",
			"Filters",
			"Adjust",
			"Templates",
		]) {
			await expect(
				navigation.getByRole("button", { name: label })
			).toBeVisible();
		}

		await page.getByTestId("effects-panel-tab").click();
		await page.getByTestId("effect-card-sepia").click();
		await expect(page.getByTestId("timeline-effect-bar")).toHaveCount(1);

		await page.evaluate(({ trackId, firstId, secondId }) => {
			const timeline = (
				window as unknown as EditorWindow
			).__timelineStore.getState();
			timeline.setSelectedElements([
				{ trackId, elementId: firstId },
				{ trackId, elementId: secondId },
			]);
		}, clips);
		await page.getByTestId("transitions-panel-tab").click();
		await page.getByTestId("transition-card-dissolve").dblclick();
		await expect(page.locator("[data-transition-marker]")).toHaveCount(1);

		await page.evaluate(({ trackId, firstId, clipDuration }) => {
			const editorWindow = window as unknown as EditorWindow;
			const timeline = editorWindow.__timelineStore.getState();
			timeline.updateMediaElement(trackId, firstId, {
				customCutout: {
					enabled: true,
					applyStrokes: true,
					strokes: [],
					status: "processing",
				},
			});
			timeline.autoShowEffectsTrack();
			timeline.setSelectedElements([{ trackId, elementId: firstId }]);
			editorWindow.__playbackStore.getState().seek(clipDuration - 0.2);
		}, clips);

		await page.getByTestId("compact-tracks-button").click();
		await expect(page.getByTestId("compact-tracks-button")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await expect(page.getByTestId("timeline-task-badge")).toBeVisible();

		const properties = page.getByTestId("media-properties");
		await properties
			.getByTestId("media-properties-visual-tabs")
			.getByRole("tab", { name: "Cutout", exact: true })
			.click();
		await expect(
			properties.getByText("智能抠像", { exact: true })
		).toBeVisible();
		await expect(
			properties.getByRole("radio", { name: "Show cutout result" })
		).toBeVisible();
		await properties
			.getByRole("radio", { name: "Show original video" })
			.click();
		await expect(
			properties.getByRole("radio", { name: "Show original video" })
		).toHaveAttribute("aria-checked", "true");

		for (const panel of [navigation, properties]) {
			const overflow = await panel.evaluate((container) => {
				const bounds = container.getBoundingClientRect();
				return [...container.querySelectorAll<HTMLElement>("*")].flatMap(
					(element) => {
						const elementBounds = element.getBoundingClientRect();
						const visible = elementBounds.width > 0 && elementBounds.height > 0;
						return visible && elementBounds.right > bounds.right + 2
							? [element.getAttribute("data-testid") ?? element.tagName]
							: [];
					}
				);
			});
			expect(overflow).toEqual([]);
		}
		await page.screenshot({
			path: path.join(artifactDirectory, "01-smart-cutout-and-timeline.png"),
			animations: "disabled",
		});

		const chromaSection = properties.getByTestId("media-chroma-key-properties");
		await chromaSection.scrollIntoViewIfNeeded();
		await expect(chromaSection).toBeVisible();
		await expect(
			properties.getByTestId("media-custom-cutout-properties")
		).toHaveCount(1);
		await page.screenshot({
			path: path.join(artifactDirectory, "02-custom-and-chroma-cutout.png"),
			animations: "disabled",
		});
	});
});
