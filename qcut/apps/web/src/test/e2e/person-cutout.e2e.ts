import { expect, test } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { _electron as electron } from "playwright";
import {
	createTestProject,
	navigateToProjects,
} from "./helpers/electron-helpers";
import { ensurePanelTabActive } from "./helpers/e2e-panel-helpers";

const sourceVideoPath = process.env.QCUT_PERSON_VIDEO_PATH;

test.describe("Local person cutout", () => {
	test.skip(
		!sourceVideoPath,
		"Set QCUT_PERSON_VIDEO_PATH to a video with people"
	);

	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a fixtures argument before testInfo.
	test("previews a MediaPipe mask and exports transparent WebM", async ({}, testInfo) => {
		test.setTimeout(180_000);
		const profileDirectory = join(
			tmpdir(),
			`qcut-person-cutout-${process.pid}-${Date.now()}`
		);
		const outputPath =
			process.env.QCUT_PERSON_CUTOUT_OUTPUT ??
			testInfo.outputPath("person-cutout.webm");
		await mkdir(dirname(outputPath), { recursive: true });

		const electronApp = await electron.launch({
			args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
			},
		});

		try {
			const page = await electronApp.firstWindow();
			page.on("console", (message) => {
				if (message.type() === "error") {
					console.error(`[renderer] ${message.text()}`);
				}
			});
			await page.waitForLoadState("domcontentloaded");
			await page.waitForFunction(
				() => Boolean(document.querySelector("#root")?.children.length),
				undefined,
				{ timeout: 30_000 }
			);
			await page.evaluate(() => {
				localStorage.setItem("hasSeenOnboarding", "true");
			});
			await navigateToProjects(page);
			await createTestProject(page, "MediaPipe Person Cutout E2E");
			await ensurePanelTabActive(page, "edit", "segmentation", "AI Assist");

			const panel = page.getByTestId("media-panel");
			await panel.getByRole("tab", { name: "Video", exact: true }).click();
			await expect(
				panel.getByRole("tab", { name: "Local person", exact: true })
			).toHaveAttribute("data-state", "active");
			await panel
				.locator('input[type="file"][accept="video/*"]')
				.setInputFiles(sourceVideoPath!);

			const preview = panel.getByTestId("person-cutout-preview");
			await expect(preview).toBeVisible();
			const previewCanvas = preview.locator("canvas");
			await expect
				.poll(
					() =>
						preview.evaluate((element) => {
							const canvas = element.querySelector("canvas")!;
							const video = element.querySelector("video")!;
							return {
								width: canvas.width,
								height: canvas.height,
								status: element.textContent,
								videoReadyState: video.readyState,
								videoError: video.error?.message ?? null,
							};
						}),
					{ timeout: 45_000 }
				)
				.toMatchObject({ width: 960, height: 540 });
			const alphaStats = await previewCanvas.evaluate((canvas) => {
				const element = canvas as HTMLCanvasElement;
				const context = element.getContext("2d", { willReadFrequently: true });
				if (!context) throw new Error("Preview canvas has no 2D context");
				const pixels = context.getImageData(
					0,
					0,
					element.width,
					element.height
				).data;
				let transparent = 0;
				let partial = 0;
				let opaque = 0;
				for (let index = 3; index < pixels.length; index += 4) {
					const alpha = pixels[index];
					if (alpha < 16) transparent += 1;
					else if (alpha > 239) opaque += 1;
					else partial += 1;
				}
				return { transparent, partial, opaque };
			});
			expect(alphaStats.transparent).toBeGreaterThan(10_000);
			expect(alphaStats.opaque).toBeGreaterThan(10_000);
			expect(alphaStats.partial).toBeGreaterThan(100);

			await panel.screenshot({
				path: testInfo.outputPath("person-cutout-preview.png"),
				animations: "disabled",
			});
			await panel.getByTestId("person-cutout-export").click();
			await expect(panel.getByTestId("person-cutout-result")).toBeVisible({
				timeout: 120_000,
			});

			const exported = await page.evaluate(async (destination) => {
				const items = (window as any).__mediaStore.getState().mediaItems;
				const item = [...items]
					.reverse()
					.find(
						(candidate: any) =>
							candidate.metadata?.source === "mediapipe-person-cutout"
					);
				if (!item) throw new Error("Cutout output was not added to Media");
				const bytes = await item.file.arrayBuffer();
				const written = await (window as any).electronAPI.writeFile(
					destination,
					bytes
				);
				return {
					written,
					size: item.file.size,
					duration: item.duration,
					width: item.width,
					height: item.height,
					hasAlpha: item.metadata?.hasAlpha,
					hasAudio: item.metadata?.hasAudio,
				};
			}, outputPath);
			expect(exported).toMatchObject({
				written: true,
				width: 960,
				height: 540,
				hasAlpha: true,
				hasAudio: true,
			});
			expect(exported.size).toBeGreaterThan(10_000);
			expect(exported.duration).toBeGreaterThan(2.5);
			await panel.screenshot({
				path: testInfo.outputPath("person-cutout-export.png"),
				animations: "disabled",
			});
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
