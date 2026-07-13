import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { createTestProject, expect, test } from "./helpers/electron-helpers";

const artifactDirectory = path.resolve(
	process.cwd(),
	"output/playwright/qcut-p2-content-ecosystem"
);

const mockMusic = {
	id: 7301,
	name: "Cinematic Morning",
	description: "Instrumental cinematic cue",
	url: "https://freesound.org/s/7301/",
	previewUrl: "https://cdn.qcut.test/cinematic-morning.mp3",
	downloadUrl: "https://cdn.qcut.test/cinematic-morning.wav",
	duration: 95,
	filesize: 2048,
	type: "wav",
	channels: 2,
	bitrate: 0,
	bitdepth: 24,
	samplerate: 48_000,
	username: "QCut Test Composer",
	tags: ["music", "cinematic", "instrumental"],
	license: "https://creativecommons.org/publicdomain/zero/1.0/",
	created: "2026-01-01",
	downloads: 400,
	rating: 4.9,
	ratingCount: 20,
};

const animatedStickerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="#22d3ee"><animate attributeName="r" values="10;24;10" dur="1.2s" repeatCount="indefinite"/></circle></svg>`;

async function expectNoHorizontalOverflow({
	locator,
}: {
	locator: Locator;
}): Promise<void> {
	await expect(locator).toBeVisible();
	const overflow = await locator.evaluate((element) => ({
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth,
	}));
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

async function installAssetMocks({
	page,
	electronApp,
}: {
	page: Page;
	electronApp: ElectronApplication;
}): Promise<void> {
	for (const host of [
		"https://api.iconify.design",
		"https://api.simplesvg.com",
		"https://api.unisvg.com",
	]) {
		await page.route(`${host}/**`, async (route) => {
			if (route.request().url().includes(".svg")) {
				await route.fulfill({
					status: 200,
					contentType: "image/svg+xml",
					headers: {
						"access-control-allow-origin": "*",
						"cross-origin-resource-policy": "cross-origin",
					},
					body: animatedStickerSvg,
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { "access-control-allow-origin": "*" },
				body: JSON.stringify({}),
			});
		});
	}
	await page.evaluate((svg) => {
		const iconifyHosts = [
			"https://api.iconify.design/",
			"https://api.simplesvg.com/",
			"https://api.unisvg.com/",
		];
		const nativeFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.startsWith("https://cdn.qcut.test/")) {
				return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]), {
					status: 200,
					headers: { "content-type": "audio/mpeg" },
				});
			}
			if (
				iconifyHosts.some((host) => url.startsWith(host)) &&
				url.includes(".svg")
			) {
				// route.fulfill is readable from app:// but reports status 0 to fetch.
				return new Response(svg, {
					status: 200,
					headers: { "content-type": "image/svg+xml" },
				});
			}
			return nativeFetch(input, init);
		};
	}, animatedStickerSvg);

	await page.route("https://cdn.qcut.test/**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "audio/mpeg",
			body: Buffer.from([73, 68, 51, 4, 0, 0, 0, 0]),
		});
	});

	await electronApp.evaluate(async ({ ipcMain }, music) => {
		type SearchRecord = { q?: string; type?: string };
		const state = globalThis as typeof globalThis & {
			__qcutP2SoundSearches?: SearchRecord[];
		};
		state.__qcutP2SoundSearches = [];
		ipcMain.removeHandler("sounds:search");
		ipcMain.handle("sounds:search", async (_event, search: SearchRecord) => {
			state.__qcutP2SoundSearches?.push(search);
			return {
				success: true,
				count: 1,
				next: null,
				previous: null,
				results: [music],
			};
		});
	}, mockMusic);
}

test.describe("P2 content ecosystem", () => {
	test("uses shared text styles, animated stickers, and real music workflows", async ({
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
		await createTestProject(page, "P2 Content Ecosystem");
		await installAssetMocks({ page, electronApp });

		await page.getByTestId("text-panel-tab").click();
		const textPanel = page.getByTestId("text-panel");
		await expect(textPanel).toBeVisible();
		await textPanel.getByRole("tab", { name: "Social" }).click();
		const socialHookTemplate = textPanel.getByRole("button", {
			name: "Add Social hook",
		});
		await expect(socialHookTemplate).toBeVisible();
		await socialHookTemplate.click();
		await expect(
			page.locator(
				'[data-testid="timeline-track"][data-track-type="text"] [data-testid="timeline-element"]'
			)
		).toHaveCount(1);
		await expectNoHorizontalOverflow({ locator: textPanel });
		await page.screenshot({
			path: path.join(artifactDirectory, "01-shared-text-templates.png"),
			animations: "disabled",
		});

		await page.getByTestId("stickers-panel-tab").click();
		const stickersPanel = page.getByTestId("stickers-panel");
		await expect(stickersPanel).toBeVisible();
		await expect(
			stickersPanel.getByRole("tab", { name: /Motion/ })
		).toHaveAttribute("data-state", "active");
		const stickerImages = stickersPanel.locator('img[src*="line-md"]');
		await expect(stickerImages.first()).toBeVisible();
		await expect
			.poll(() =>
				stickerImages
					.first()
					.evaluate(
						(image) =>
							(image as HTMLImageElement).complete &&
							(image as HTMLImageElement).naturalWidth > 0
					)
			)
			.toBe(true);
		const firstStickerSource = await stickerImages.first().getAttribute("src");
		expect(firstStickerSource).toBeTruthy();
		const stickerMarkup = await page.evaluate(async (source) => {
			const response = await fetch(source);
			return response.text();
		}, firstStickerSource as string);
		expect(stickerMarkup).toContain("<animate");

		await stickersPanel.getByTestId("sticker-item").first().click();
		await expect(page.locator("[data-sticker-id]")).toHaveCount(1);
		await expect(
			page.locator(
				'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
			)
		).toHaveCount(1);
		await expectNoHorizontalOverflow({ locator: stickersPanel });
		await page.screenshot({
			path: path.join(artifactDirectory, "02-motion-sticker-timeline.png"),
			animations: "allow",
		});

		await page.getByTestId("audio-panel-tab").click();
		const audioLibrary = page.getByTestId("audio-library");
		await expect(audioLibrary).toBeVisible();
		await expect(
			audioLibrary.getByRole("button", { name: "Whoosh" })
		).toBeVisible();
		await audioLibrary.getByRole("tab", { name: "Songs" }).click();
		const songs = page.getByTestId("songs-view");
		await expect(songs.getByText(mockMusic.name)).toBeVisible();
		await expect(songs.getByText("CC0-1.0")).toBeVisible();
		await songs
			.getByRole("button", { name: `Favorite ${mockMusic.name}` })
			.click();
		await expect(
			songs.getByRole("button", {
				name: `Remove ${mockMusic.name} from favorites`,
			})
		).toBeVisible();
		await songs
			.getByRole("button", { name: `Add ${mockMusic.name} to timeline` })
			.click();
		await expect(
			page.locator(
				'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
			)
		).toHaveCount(1);
		await expectNoHorizontalOverflow({ locator: audioLibrary });
		await page.screenshot({
			path: path.join(artifactDirectory, "03-music-library-and-license.png"),
			animations: "disabled",
		});

		const searches = await electronApp.evaluate(() => {
			const state = globalThis as typeof globalThis & {
				__qcutP2SoundSearches?: Array<{ type?: string }>;
			};
			return state.__qcutP2SoundSearches ?? [];
		});
		expect(searches.some((search) => search.type === "songs")).toBe(true);
	});
});
