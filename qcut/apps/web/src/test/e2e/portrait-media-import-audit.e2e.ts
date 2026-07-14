import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { createTestProject, expect, test } from "./helpers/electron-helpers";
import { importPortraitAuditFixtures } from "./helpers/portrait-audit-helpers";
import {
	missingPortraitAuditFixtures,
	portraitAuditFixtures,
} from "./helpers/portrait-audit-fixtures";

const outputDirectory = path.resolve(
	"output/playwright/portrait-filter-transition-audit/run-01-import"
);

interface AuditMediaItem {
	id: string;
	name: string;
	type: string;
	duration?: number;
	width?: number;
	height?: number;
	thumbnailStatus?: string;
	thumbnailUrl?: string;
}

interface AuditTimelineElement {
	id: string;
	mediaId: string;
	name: string;
	startTime: number;
	duration: number;
}

interface AuditWindow extends Window {
	__mediaStore: {
		getState: () => { mediaItems: AuditMediaItem[] };
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				type: string;
				isMain?: boolean;
				elements: AuditTimelineElement[];
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
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
}

async function createOrientationClips({ page }: { page: Page }) {
	return page.evaluate(() => {
		const editorWindow = window as AuditWindow;
		const media = editorWindow.__mediaStore.getState().mediaItems;
		const timeline = editorWindow.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		const portrait = media.find(
			(item) => item.name === "colorful-influencer-10s.mp4"
		);
		const landscape = media.find(
			(item) => item.name === "university-woman-landscape-10s.mp4"
		);
		if (!track || !portrait || !landscape) {
			throw new Error("Missing audit track or orientation fixtures");
		}
		const clipDuration = 4;
		const portraitId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: portrait.id,
			name: portrait.name,
			duration: clipDuration,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
		});
		const landscapeId = timeline.addElementToTrack(track.id, {
			type: "media",
			mediaId: landscape.id,
			name: landscape.name,
			duration: clipDuration,
			startTime: clipDuration,
			trimStart: 0,
			trimEnd: 0,
		});
		if (!portraitId || !landscapeId) {
			throw new Error("Failed to create audit orientation clips");
		}
		return { trackId: track.id, portraitId, landscapeId };
	});
}

async function capturePreview({
	page,
	trackId,
	elementId,
	time,
	fileName,
	expectedWidth,
	expectedHeight,
}: {
	page: Page;
	trackId: string;
	elementId: string;
	time: number;
	fileName: string;
	expectedWidth: number;
	expectedHeight: number;
}) {
	await page.evaluate(
		({ selectedTrackId, selectedElementId, seekTime }) => {
			const editorWindow = window as AuditWindow;
			editorWindow.__timelineStore
				.getState()
				.setSelectedElements([
					{ trackId: selectedTrackId, elementId: selectedElementId },
				]);
			editorWindow.__playbackStore.getState().seek(seekTime);
		},
		{
			selectedTrackId: trackId,
			selectedElementId: elementId,
			seekTime: time,
		}
	);
	const video = page.getByTestId("preview-panel").locator("video").first();
	await expect(video).toBeVisible();
	await expect
		.poll(() =>
			video.evaluate((element: HTMLVideoElement) => ({
				readyState: element.readyState,
				width: element.videoWidth,
				height: element.videoHeight,
			}))
		)
		.toEqual({ readyState: 4, width: expectedWidth, height: expectedHeight });
	await page.screenshot({
		path: path.join(outputDirectory, fileName),
		animations: "disabled",
	});
}

test.skip(
	missingPortraitAuditFixtures().length > 0,
	"Portrait audit fixtures are missing; set QCUT_PORTRAIT_AUDIT_DIR"
);

test.describe("Real portrait media import audit", () => {
	test("imports, identifies, thumbnails, and previews portrait and landscape clips", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(240_000);
		await rm(outputDirectory, { recursive: true, force: true });
		await mkdir(outputDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await createTestProject(page, "Portrait Media Import Audit");
		await importPortraitAuditFixtures({
			page,
			fixtures: portraitAuditFixtures,
		});

		const mediaItems = await page.evaluate(() =>
			(window as AuditWindow).__mediaStore
				.getState()
				.mediaItems.map((item) => ({
					name: item.name,
					type: item.type,
					duration: item.duration,
					width: item.width,
					height: item.height,
					thumbnailStatus: item.thumbnailStatus,
					hasThumbnail: item.thumbnailUrl?.startsWith("data:image/") === true,
				}))
		);
		expect(mediaItems).toHaveLength(portraitAuditFixtures.length);
		for (const fixture of portraitAuditFixtures) {
			const item = mediaItems.find(
				(candidate) => candidate.name === fixture.fileName
			);
			expect(item, fixture.fileName).toMatchObject({
				type: "video",
				width: fixture.width,
				height: fixture.height,
				hasThumbnail: true,
			});
			expect(item?.duration, fixture.fileName).toBeCloseTo(fixture.duration, 1);
		}
		await page.screenshot({
			path: path.join(outputDirectory, "01-six-imported-fixtures.png"),
			animations: "disabled",
		});

		const { trackId, portraitId, landscapeId } = await createOrientationClips({
			page,
		});
		await capturePreview({
			page,
			trackId,
			elementId: portraitId,
			time: 1.5,
			fileName: "02-portrait-preview.png",
			expectedWidth: 720,
			expectedHeight: 1280,
		});
		await capturePreview({
			page,
			trackId,
			elementId: landscapeId,
			time: 5.5,
			fileName: "03-landscape-preview.png",
			expectedWidth: 1280,
			expectedHeight: 720,
		});
	});
});
