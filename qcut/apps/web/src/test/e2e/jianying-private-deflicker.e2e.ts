import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const runtimeManifestPath = path.join(
	process.env.HOME ?? "",
	"Library",
	"Application Support",
	"QCut",
	"PrivateRuntimes",
	"JianyingBasicVideo",
	"current",
	"manifest.json"
);
const sourcePath = path.resolve(
	process.env.QCUT_JIANYING_BASIC_VIDEO_SOURCE ??
		"docs/task/jianying-video-basic-panel-reference/evidence/real-video-matrix/02-real-person-challenge-noisy-3s.mp4"
);
const evidenceDirectory = path.resolve(
	process.env.QCUT_JIANYING_BASIC_VIDEO_EVIDENCE ??
		"docs/task/jianying-video-basic-panel-reference/evidence/real-video-matrix"
);

interface DeflickerHarnessWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				file: File;
				id: string;
				name: string;
				type: string;
				duration?: number;
				localPath?: string;
			}>;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				isMain?: boolean;
				type: string;
				elements: Array<{
					enhancements?: { labDeflicker?: number };
					id: string;
					mediaId: string;
					name: string;
				}>;
			}>;
			addElementToTrack: (
				trackId: string,
				element: Record<string, unknown>
			) => string | null;
			setSelectedElements: (
				selection: Array<{ elementId: string; trackId: string }>
			) => void;
		};
	};
}

async function addImportedVideo({ page }: { page: Page }) {
	return page.evaluate(() => {
		const stores = window as unknown as DeflickerHarnessWindow;
		const media = stores.__mediaStore.getState().mediaItems[0];
		const timeline = stores.__timelineStore.getState();
		const track = timeline.tracks.find(
			(candidate) => candidate.isMain || candidate.type === "media"
		);
		if (!media || !track) throw new Error("Expected imported video and track");
		const elementId = timeline.addElementToTrack(track.id, {
			duration: media.duration ?? 3,
			mediaId: media.id,
			name: media.name,
			startTime: 0,
			trimEnd: 0,
			trimStart: 0,
			type: "media",
		});
		if (!elementId) throw new Error("Unable to add the imported video");
		timeline.setSelectedElements([{ elementId, trackId: track.id }]);
		return { elementId, originalMediaId: media.id, trackId: track.id };
	});
}

async function readReplacementState({
	elementId,
	page,
	trackId,
}: {
	elementId: string;
	page: Page;
	trackId: string;
}) {
	return page.evaluate(
		({ selectedElementId, selectedTrackId }) => {
			const stores = window as unknown as DeflickerHarnessWindow;
			const element = stores.__timelineStore
				.getState()
				.tracks.find(({ id }) => id === selectedTrackId)
				?.elements.find(({ id }) => id === selectedElementId);
			if (!element) throw new Error("Processed timeline element is missing");
			const media = stores.__mediaStore
				.getState()
				.mediaItems.find(({ id }) => id === element.mediaId);
			if (!media) throw new Error("Processed media item is missing");
			return {
				deflickerStrength: element.enhancements?.labDeflicker ?? 0,
				fileSize: media.file.size,
				mediaId: media.id,
				localPath: media.localPath,
				mediaName: media.name,
				mediaType: media.type,
			};
		},
		{ selectedElementId: elementId, selectedTrackId: trackId }
	);
}

test.describe("Jianying private-cache deflicker", () => {
	test.skip(
		process.platform !== "darwin" ||
			!existsSync(runtimeManifestPath) ||
			!existsSync(sourcePath),
		"Requires macOS, the local QCut private runtime, and the real-person source"
	);
	test.use({ captureScreenshotVideo: false });

	test("processes and replaces a real video from the visible QCut UI", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(240_000);
		await mkdir(evidenceDirectory, { recursive: true });
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				height: 1040,
				width: 1800,
				x: 20,
				y: 20,
			});
		});
		await createTestProject(page, "Jianying Private Deflicker E2E");
		await uploadTestMedia(page, sourcePath);
		const clip = await addImportedVideo({ page });
		await expect(page.getByTestId("media-properties")).toBeVisible();

		const lab = page.getByTestId("media-lab-properties");
		await lab.scrollIntoViewIfNeeded();
		const strengthInput = lab.getByLabel("实验室防闪烁数值");
		await strengthInput.fill("70");
		await strengthInput.press("Tab");
		await expect(strengthInput).toHaveValue("70");

		const action = lab.getByRole("button", {
			name: "使用本机剪映缓存处理",
		});
		await expect(action).toBeEnabled();
		await action.click();
		await expect(lab.getByText("本机防闪烁处理完成")).toBeVisible({
			timeout: 180_000,
		});

		const state = await readReplacementState({ page, ...clip });
		expect(state).toMatchObject({
			deflickerStrength: 0,
			mediaType: "video",
		});
		expect(state.mediaId).not.toBe(clip.originalMediaId);
		expect(state.mediaName).toMatch(/-deflicker\.mp4$/);
		expect(state.fileSize).toBeGreaterThan(100_000);
		expect(state.localPath).toContain(
			"/Library/Caches/QCut/JianyingBasicVideo/deflicker/"
		);
		await expect(strengthInput).toHaveValue("0");

		const runtime = await page.evaluate(() =>
			window.electronAPI?.jianyingBasicVideo?.inspect()
		);
		expect(runtime).toMatchObject({
			available: true,
			localOnly: true,
			platformSupported: true,
		});
		await page.screenshot({
			animations: "disabled",
			path: path.join(evidenceDirectory, "qcut-private-deflicker-ui.png"),
		});
		await writeFile(
			path.join(evidenceDirectory, "qcut-private-deflicker-ui.json"),
			`${JSON.stringify({ clip, runtime, sourcePath, state }, null, 2)}\n`,
			"utf8"
		);
	});
});
