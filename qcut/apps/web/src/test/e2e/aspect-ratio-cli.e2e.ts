/**
 * CLI ratio gate.
 *
 * `qcut editor:project:update-settings --ratio <name>` must land on the same
 * canvas size the preview ratio menu uses, so an agent picking "9:16" from the
 * terminal and an editor picking it from the menu end up in the same place.
 * This spec drives the real CLI against an isolated QCut instance and checks
 * the live editor state plus the menu's check mark.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { createTestProject, uploadTestMedia } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-aspect-cli-fixtures");

function generateClip(): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, "ratio-cli-base.mp4");
	if (existsSync(filePath)) return filePath;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=1280x720:rate=30:duration=2",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

function projectIdFromPage(page: Page): string {
	const projectId = new URL(page.url()).hash.match(/^#\/editor\/([^/?]+)/)?.[1];
	if (!projectId) throw new Error("Could not resolve the E2E project id");
	return decodeURIComponent(projectId);
}

function runCli({
	apiPort,
	args,
}: {
	apiPort: number;
	args: string[];
}): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		execFile(
			"bun",
			["--silent", "run", "qcut", "--", ...args, "--json"],
			{
				cwd: path.resolve("."),
				env: { ...process.env, QCUT_API_PORT: String(apiPort) },
				maxBuffer: 8 * 1024 * 1024,
				timeout: 120_000,
			},
			(error, stdout, stderr) => {
				const code =
					error && typeof (error as { code?: unknown }).code === "number"
						? ((error as { code: number }).code ?? 1)
						: error
							? 1
							: 0;
				resolve({ code, stdout, stderr });
			}
		);
	});
}

async function readCanvas(page: Page) {
	return page.evaluate(() => {
		const store = (
			window as unknown as {
				__editorStore: {
					getState: () => {
						canvasSize: { width: number; height: number };
						canvasMode: string;
					};
				};
			}
		).__editorStore.getState();
		return { mode: store.canvasMode, ...store.canvasSize };
	});
}

test.use({ captureScreenshotVideo: false });
test.setTimeout(600_000);

test.describe("aspect ratio via CLI", () => {
	test("--ratio lands on the menu's preset size and the menu agrees", async ({
		page,
		apiPort,
	}) => {
		await createTestProject(page, "Ratio CLI");
		const projectId = projectIdFromPage(page);
		await uploadTestMedia(page, generateClip());

		// A clip on the timeline enables the ratio trigger and snaps the canvas
		// to 16:9 through the first-media auto-canvas path.
		await page.evaluate(() => {
			const harness = window as unknown as {
				__timelineStore: { getState: () => any };
				__mediaStore: { getState: () => any };
			};
			const item = harness.__mediaStore
				.getState()
				.mediaItems.find(
					(candidate: { type: string }) => candidate.type === "video"
				);
			if (!item) throw new Error("No video imported");
			const state = harness.__timelineStore.getState();
			const trackId =
				state.tracks.find(
					(track: { isMain?: boolean; type: string }) =>
						track.isMain || track.type === "media"
				)?.id ?? state.addTrack("media");
			harness.__timelineStore.getState().addElementToTrack(
				trackId,
				{
					duration: 2,
					mediaId: item.id,
					name: "ratio-cli-clip",
					startTime: 0,
					trimEnd: 0,
					trimStart: 0,
					type: "media",
				},
				{ pushHistory: false, selectElement: false }
			);
		});
		await expect
			.poll(() => readCanvas(page), { timeout: 15_000 })
			.toMatchObject({ width: 1920, height: 1080 });

		// --- named preset ------------------------------------------------------
		const portrait = await runCli({
			apiPort,
			args: [
				"editor:project:update-settings",
				"--project-id",
				projectId,
				"--ratio",
				"9:16",
			],
		});
		expect(portrait.code, portrait.stderr || portrait.stdout).toBe(0);
		await expect
			.poll(() => readCanvas(page), { timeout: 15_000 })
			.toMatchObject({ width: 1080, height: 1920 });

		const trigger = page.getByTestId("aspect-ratio-trigger");
		await expect(trigger).toHaveText("9:16");
		await trigger.click();
		const items = page.getByRole("menuitem");
		await expect(items).toHaveCount(12);
		await expect(
			items.filter({ hasText: "9:16" }).locator("svg.lucide-check")
		).toHaveCount(1);
		await expect(
			items.filter({ hasText: "16:9" }).locator("svg.lucide-check")
		).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(items).toHaveCount(0);

		// --- alias ---------------------------------------------------------------
		const phone = await runCli({
			apiPort,
			args: [
				"editor:project:update-settings",
				"--project-id",
				projectId,
				"--ratio",
				"5.8寸",
			],
		});
		expect(phone.code, phone.stderr || phone.stdout).toBe(0);
		await expect
			.poll(() => readCanvas(page), { timeout: 15_000 })
			.toMatchObject({ width: 1080, height: 2340 });
		await expect(trigger).toHaveText(/5\.8|9:19\.5/);

		// --- unknown name fails before touching the project ----------------------
		const unknown = await runCli({
			apiPort,
			args: [
				"editor:project:update-settings",
				"--project-id",
				projectId,
				"--ratio",
				"4:5",
			],
		});
		expect(unknown.code).not.toBe(0);
		// The --json envelope escapes the quotes around the offending name.
		expect(`${unknown.stdout}\n${unknown.stderr}`).toMatch(
			/Unknown --ratio \\?"4:5\\?"\. Known presets: 16:9/
		);
		expect(await readCanvas(page)).toMatchObject({
			width: 1080,
			height: 2340,
		});
	});
});
