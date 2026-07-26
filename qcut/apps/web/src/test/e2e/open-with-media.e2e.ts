import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

const stagedFfmpegPath = join(
	process.cwd(),
	"electron",
	"resources",
	"ffmpeg",
	`${process.platform}-${process.arch}`,
	process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
);

test.describe("Open With QCut (file association)", () => {
	test.skip(
		!existsSync(stagedFfmpegPath),
		"Staged FFmpeg binary required to generate the fixture video"
	);

	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a fixtures argument before testInfo.
	test("opening a video file creates a project with the clip on the timeline", async ({}, testInfo) => {
		test.setTimeout(120_000);

		const workDirectory = join(
			tmpdir(),
			`qcut-open-with-${process.pid}-${Date.now()}`
		);
		await mkdir(workDirectory, { recursive: true });
		const profileDirectory = join(workDirectory, "profile");
		const videoPath = join(workDirectory, "opened-clip.mp4");

		execFileSync(stagedFfmpegPath, [
			"-f",
			"lavfi",
			"-i",
			"testsrc=duration=2:size=320x240:rate=30",
			"-pix_fmt",
			"yuv420p",
			"-y",
			videoPath,
		]);

		// The video path rides along as a launch argument, exactly how the OS
		// hands a file to the app on Windows/Linux "Open With".
		const electronApp = await electron.launch({
			args: [
				`--user-data-dir=${profileDirectory}`,
				"dist/electron/main.js",
				videoPath,
			],
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				ELECTRON_DISABLE_GPU: "1",
			},
		});

		const rendererErrors: string[] = [];
		try {
			const page = await electronApp.firstWindow();
			page.on("console", (message) => {
				if (message.type() === "error") {
					rendererErrors.push(message.text());
				}
			});
			await page.waitForLoadState("domcontentloaded");

			// The app should import the file and land in the editor on its own.
			await expect(page.getByTestId("timeline-element")).toBeVisible({
				timeout: 60_000,
			});

			// New project is named after the file.
			await expect(page.getByTestId("project-menu-button")).toContainText(
				"opened-clip"
			);

			// Media item made it into the project's library.
			await expect(page.getByTestId("media-item").first()).toBeVisible({
				timeout: 15_000,
			});

			// Version IPC responds. Note: this launch has no app package.json,
			// so Electron's own version comes back instead of the calendar
			// release version that `electron .` and packaged builds report.
			const version = await page.evaluate(() =>
				(
					window as unknown as {
						electronAPI: { getAppVersion: () => Promise<string> };
					}
				).electronAPI.getAppVersion()
			);
			expect(version).toMatch(/^\d+\.\d+\.\d+/);

			await page.screenshot({
				path: testInfo.outputPath("open-with-success.png"),
			});
		} finally {
			await electronApp.close();
			await rm(workDirectory, { recursive: true, force: true });
		}

		const importErrors = rendererErrors.filter((text) =>
			text.includes("[FileOpenHandler]")
		);
		expect(importErrors).toEqual([]);
	});
});
