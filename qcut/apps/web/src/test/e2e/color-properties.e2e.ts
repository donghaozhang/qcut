import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
	createTestProject,
	expect,
	importTestVideo,
	test,
} from "./helpers/electron-helpers";

const outputDir =
	process.env.QCUT_COLOR_AUDIT_DIR ??
	path.join(process.env.TMPDIR ?? "/tmp", "qcut-color-visual-audit");

function expectRenderParity({
	nativePath,
	muxerPath,
}: {
	nativePath: string;
	muxerPath: string;
}) {
	const platform = `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
	const ffmpegPath = path.resolve(
		"electron/resources/ffmpeg",
		platform,
		"ffmpeg"
	);
	if (!existsSync(ffmpegPath)) return;
	const comparison = spawnSync(
		ffmpegPath,
		[
			"-hide_banner",
			"-i",
			nativePath,
			"-i",
			muxerPath,
			"-filter_complex",
			"[0:v]scale=854:480,trim=duration=0.9,settb=1/30,setpts=PTS-STARTPTS[native];" +
				"[1:v]trim=duration=0.9,settb=1/30,setpts=PTS-STARTPTS[muxer];" +
				"[native][muxer]ssim",
			"-an",
			"-f",
			"null",
			"-",
		],
		{ encoding: "utf8", timeout: 30_000 }
	);
	expect(comparison.status, comparison.stderr).toBe(0);
	const score = Number(/SSIM[^\n]*All:([0-9.]+)/.exec(comparison.stderr)?.[1]);
	expect(score).toBeGreaterThan(0.9);
}

async function addVideo({ page }: { page: Page }) {
	const mediaItem = page.getByTestId("media-item").first();
	await expect(mediaItem).toBeVisible();
	await mediaItem.hover();
	await mediaItem.locator("button").first().click({ force: true });
	const clip = page.locator(
		'[data-testid="timeline-track"][data-track-type="media"] [data-testid="timeline-element"]'
	);
	await expect(clip).toHaveCount(1);
	await clip.click();
}

async function setColorNumber({
	page,
	label,
	value,
}: {
	page: Page;
	label: string;
	value: number;
}) {
	const input = page.getByLabel(`${label} value`);
	await input.fill(String(value));
	await input.press("Tab");
}

async function enableModule({
	panel,
	name,
}: {
	panel: ReturnType<Page["getByTestId"]>;
	name: string;
}) {
	const toggle = panel.getByLabel(`Enable ${name}`);
	if (!(await toggle.isChecked())) await toggle.click();
}

test.describe("Professional color properties", () => {
	test("grades, keyframes, scopes, masks, and renders a pixel preview", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(240_000);
		await rm(outputDir, { recursive: true, force: true });
		await mkdir(outputDir, { recursive: true });
		await createTestProject(page, "Professional Color Audit");
		await importTestVideo(page);
		await addVideo({ page });
		await page.getByTestId("panel-tab-properties").click();
		const properties = page.getByTestId("media-properties");
		await properties.getByRole("tab", { name: "Adjust" }).click();
		const panel = properties.getByTestId("color-properties-panel");
		await expect(panel).toBeVisible();
		await expect(panel.getByRole("tab")).toHaveCount(6);
		await enableModule({ panel, name: "Smart correction" });
		const smartModule = panel.getByTestId("color-module-smart");
		if (
			!(await smartModule.evaluate((node) => (node as HTMLDetailsElement).open))
		) {
			await smartModule.locator("summary").click();
		}
		await smartModule.getByRole("button", { name: "Auto" }).click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as any).__timelineStore
						.getState()
						.tracks.flatMap((track: any) => track.elements)[0];
					return element.color.smart.status;
				})
			)
			.toBe("ready");
		await smartModule
			.locator('input[type="file"]')
			.setInputFiles(
				path.resolve("apps/web/src/test/e2e/fixtures/media/sample-image.png")
			);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as any).__timelineStore
						.getState()
						.tracks.flatMap((track: any) => track.elements)[0];
					return element.color.smart.referenceName;
				})
			)
			.toBe("sample-image.png");
		await smartModule.screenshot({
			path: path.join(outputDir, "00-smart-color-match.png"),
			animations: "disabled",
		});

		await setColorNumber({ page, label: "Exposure", value: 0.6 });
		await setColorNumber({ page, label: "Highlights", value: -18 });
		await setColorNumber({ page, label: "Shadows", value: 24 });
		await setColorNumber({ page, label: "Vibrance", value: 32 });
		await setColorNumber({ page, label: "Grain", value: 8 });
		await panel.getByLabel("Add Exposure keyframe").click();
		await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)[0];
			(window as any).__playbackStore.getState().seek(element.startTime + 1);
		});
		await setColorNumber({ page, label: "Exposure", value: -0.3 });
		await expect(panel.getByLabel("Previous Exposure keyframe")).toBeEnabled();
		await panel.screenshot({
			path: path.join(outputDir, "01-basic-keyframes.png"),
			animations: "disabled",
		});

		await enableModule({ panel, name: "LUT" });
		const lutModule = panel.getByTestId("color-module-lut");
		if (
			!(await lutModule.evaluate((node) => (node as HTMLDetailsElement).open))
		) {
			await lutModule.locator("summary").click();
		}
		await panel.getByLabel("LUT preset").click();
		await page.getByRole("option", { name: "Cinematic Teal & Gold" }).click();
		await setColorNumber({ page, label: "Intensity", value: 72 });
		await setColorNumber({ page, label: "Skin protection", value: 45 });
		await lutModule.screenshot({
			path: path.join(outputDir, "02-lut.png"),
			animations: "disabled",
		});

		await enableModule({ panel, name: "Color management" });
		const managementModule = panel.getByTestId("color-module-management");
		if (
			!(await managementModule.evaluate(
				(node) => (node as HTMLDetailsElement).open
			))
		) {
			await managementModule.locator("summary").click();
		}
		await managementModule.getByLabel("Input").click();
		await page.getByRole("option", { name: "Display P3" }).click();
		await managementModule.getByLabel("Working").click();
		await page.getByRole("option", { name: "ACEScg" }).click();
		await managementModule.getByLabel("Output").click();
		await page.getByRole("option", { name: "Rec.709" }).click();
		await managementModule.getByLabel("Tone mapping").click();
		await page.getByRole("option", { name: "ACES" }).click();
		await setColorNumber({ page, label: "Peak luminance", value: 1_000 });
		await managementModule.screenshot({
			path: path.join(outputDir, "02b-color-management.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "HSL" }).click();
		await enableModule({ panel, name: "HSL secondary" });
		await setColorNumber({ page, label: "Hue", value: 18 });
		await setColorNumber({ page, label: "Saturation", value: 28 });
		await panel.screenshot({
			path: path.join(outputDir, "03-hsl.png"),
			animations: "disabled",
		});
		await panel.getByLabel("Reset HSL secondary").click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as any).__timelineStore
						.getState()
						.tracks.flatMap((track: any) => track.elements)[0];
					return {
						enabled: element.color.hsl.enabled,
						hue: element.color.hsl.ranges.red.hue,
					};
				})
			)
			.toEqual({ enabled: false, hue: 0 });
		await enableModule({ panel, name: "HSL secondary" });
		await setColorNumber({ page, label: "Hue", value: 18 });
		await setColorNumber({ page, label: "Saturation", value: 28 });
		await panel.getByLabel("Add Hue keyframe").click();
		await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)[0];
			(window as any).__playbackStore.getState().seek(element.startTime + 2);
		});
		await setColorNumber({ page, label: "Hue", value: -12 });

		await panel.getByRole("tab", { name: "Curves" }).click();
		await enableModule({ panel, name: "RGB curves" });
		const curveEditor = panel.getByRole("button", {
			name: "master curve editor",
		});
		await curveEditor.click({ position: { x: 120, y: 72 } });

		await enableModule({ panel, name: "Secondary curves" });
		const secondaryModule = panel.getByTestId("color-module-secondary-curves");
		await secondaryModule.getByLabel("Hue vs Saturation Red anchor").click();
		await secondaryModule
			.getByLabel("Hue vs Saturation point output")
			.fill("35");
		await secondaryModule
			.getByLabel("Hue vs Saturation point output")
			.press("Tab");
		await secondaryModule
			.getByTestId("curve-keyframes-secondaryCurves.hueVsSaturation")
			.getByLabel("Add curve shape keyframe")
			.click();
		await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)[0];
			(window as any).__playbackStore.getState().seek(element.startTime + 3);
		});
		await secondaryModule
			.getByLabel("Hue vs Saturation point output")
			.fill("-20");
		await secondaryModule
			.getByLabel("Hue vs Saturation point output")
			.press("Tab");

		for (const [label, output] of [
			["Hue vs Hue", 18],
			["Hue vs Luminance", 22],
			["Luminance vs Saturation", 28],
			["Saturation vs Saturation", -24],
		] as const) {
			await secondaryModule
				.getByRole("button", { name: `${label} curve editor` })
				.click({ position: { x: 165, y: 70 } });
			await secondaryModule
				.getByLabel(`${label} point output`)
				.fill(String(output));
			await secondaryModule.getByLabel(`${label} point output`).press("Tab");
		}
		await secondaryModule.getByLabel("Reset Hue vs Luminance").click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as any).__timelineStore
						.getState()
						.tracks.flatMap((track: any) => track.elements)[0];
					return element.color.secondaryCurves.hueVsLuminance.points.length;
				})
			)
			.toBe(2);
		await secondaryModule
			.getByRole("button", { name: "Hue vs Luminance curve editor" })
			.click({ position: { x: 165, y: 70 } });
		await secondaryModule
			.getByLabel("Hue vs Luminance point output")
			.fill("22");
		await secondaryModule
			.getByLabel("Hue vs Luminance point output")
			.press("Tab");

		await secondaryModule.getByLabel("Pick Hue vs Saturation color").click();
		const pickerCanvas = page.getByTestId("color-preview-canvas").first();
		await expect(pickerCanvas).toHaveClass(/cursor-crosshair/);
		const pickerBounds = await pickerCanvas.boundingBox();
		if (!pickerBounds) throw new Error("Color picker canvas has no layout box");
		await page.mouse.click(pickerBounds.x + 80, pickerBounds.y + 60);
		await expect(pickerCanvas).not.toHaveClass(/cursor-crosshair/);
		await secondaryModule.screenshot({
			path: path.join(outputDir, "04b-secondary-curves.png"),
			animations: "disabled",
		});
		await panel.screenshot({
			path: path.join(outputDir, "04-curves.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "Wheels" }).click();
		await enableModule({ panel, name: "Color wheels" });
		await setColorNumber({ page, label: "Strength", value: 80 });
		const shadowsWheel = panel.getByRole("slider", {
			name: "shadows color wheel",
		});
		const wheelBox = await shadowsWheel.boundingBox();
		if (!wheelBox) throw new Error("Shadows color wheel has no layout box");
		await page.mouse.click(
			wheelBox.x + wheelBox.width * 0.32,
			wheelBox.y + wheelBox.height * 0.38
		);
		await setColorNumber({ page, label: "Shadows luminance", value: 8 });
		await expect(
			panel.getByRole("slider", { name: "offset color wheel" })
		).toBeVisible();
		await panel.getByLabel("Offset Red").fill("0.12");
		await panel.getByLabel("Offset Red").press("Tab");
		await expect(
			panel.getByRole("button", { name: "Apply all" })
		).toBeVisible();
		await expect(
			panel.getByRole("button", { name: "Save preset" })
		).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "05-wheels.png"),
			animations: "disabled",
		});
		await panel.getByLabel("Color wheel mode").click();
		await page.getByRole("option", { name: "Lift / Gamma / Gain" }).click();
		await expect(panel.getByText("Lift", { exact: true })).toBeVisible();
		await expect(panel.getByText("Gamma", { exact: true })).toBeVisible();
		await expect(panel.getByText("Gain", { exact: true })).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "05b-lift-gamma-gain.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "Mask" }).click();
		await enableModule({ panel, name: "Grade mask" });
		await panel.getByRole("button", { name: "Ellipse mask" }).click();
		await expect(panel.getByText("Grade mask 1")).toBeVisible();
		await panel.screenshot({
			path: path.join(outputDir, "06-grade-mask.png"),
			animations: "disabled",
		});

		await panel.getByRole("tab", { name: "Scopes" }).click();
		const scopes = panel.getByTestId("color-scopes-panel");
		await expect(scopes).toBeVisible();
		await expect
			.poll(() =>
				scopes.locator("canvas").evaluate((canvas) => {
					const context = canvas.getContext("2d");
					if (!context || canvas.width === 0 || canvas.height === 0) return 0;
					const pixels = context.getImageData(
						0,
						0,
						canvas.width,
						canvas.height
					).data;
					let colored = 0;
					for (let index = 0; index < pixels.length; index += 16) {
						if (
							pixels[index] !== pixels[index + 1] ||
							pixels[index + 1] !== pixels[index + 2]
						)
							colored += 1;
					}
					return colored;
				})
			)
			.toBeGreaterThan(0);
		await scopes.screenshot({
			path: path.join(outputDir, "07-scopes-histogram.png"),
			animations: "disabled",
		});
		await scopes.getByLabel("Waveform").click();
		await scopes.screenshot({
			path: path.join(outputDir, "08-scopes-waveform.png"),
			animations: "disabled",
		});
		await scopes.getByLabel("Vector").click();
		await expect(scopes.locator("canvas")).toHaveAttribute(
			"aria-label",
			"vectorscope scope"
		);
		await scopes.screenshot({
			path: path.join(outputDir, "08b-scopes-vectorscope.png"),
			animations: "disabled",
		});
		await scopes.getByLabel("RGB").click();
		await expect(scopes.locator("canvas")).toHaveAttribute(
			"aria-label",
			"parade scope"
		);
		await scopes.screenshot({
			path: path.join(outputDir, "08c-scopes-rgb-parade.png"),
			animations: "disabled",
		});

		await panel.getByLabel("Color preset name").fill("Secondary curve audit");
		await panel.getByLabel("Save color preset").click();
		await expect(panel.getByLabel("Saved color preset")).toContainText(
			"Secondary curve audit"
		);
		await panel.getByRole("tab", { name: "Curves" }).click();
		await setColorNumber({ page, label: "Secondary curve mix", value: 45 });
		await panel.getByLabel("Apply color preset").click();
		await expect
			.poll(() =>
				page.evaluate(() => {
					const element = (window as any).__timelineStore
						.getState()
						.tracks.flatMap((track: any) => track.elements)[0];
					return element.color.secondaryCurves.mix;
				})
			)
			.toBe(100);
		await panel.getByLabel("Show original preview").click();
		await expect(panel.getByLabel("Show graded preview")).toBeVisible();
		await panel.getByLabel("Show graded preview").click();
		await panel.getByLabel("Delete color preset").click();

		const previewCanvas = page.getByTestId("color-preview-canvas").first();
		await expect(previewCanvas).toBeVisible();
		await expect
			.poll(() =>
				previewCanvas.evaluate((canvas) => {
					const context = canvas.getContext("2d");
					if (!context || canvas.width === 0 || canvas.height === 0) return 0;
					const pixels = context.getImageData(
						0,
						0,
						canvas.width,
						canvas.height
					).data;
					let visible = 0;
					for (let index = 3; index < pixels.length; index += 64) {
						if (pixels[index] > 0) visible += 1;
					}
					return visible;
				})
			)
			.toBeGreaterThan(0);
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(outputDir, "09-graded-preview.png"),
			animations: "disabled",
		});

		const state = await page.evaluate(() => {
			const element = (window as any).__timelineStore
				.getState()
				.tracks.flatMap((track: any) => track.elements)[0];
			return {
				color: element.color,
				masks: element.masks,
				legacy: element.adjustments,
			};
		});
		expect(state.color.basic).toMatchObject({
			highlights: -18,
			shadows: 24,
			vibrance: 32,
			grain: 8,
		});
		expect(state.color.keyframes["basic.exposure"]).toHaveLength(2);
		expect(state.color.smart).toMatchObject({
			enabled: true,
			status: "ready",
			referenceName: "sample-image.png",
		});
		expect(state.color.lut).toMatchObject({
			enabled: true,
			presetId: "cinematic",
			intensity: 72,
			skinProtection: 45,
		});
		expect(state.color.lut.cube.values.length).toBeGreaterThan(1_000);
		expect(state.color.hsl.ranges.red).toMatchObject({
			hue: 18,
			saturation: 28,
		});
		expect(state.color.keyframes["hsl.red.hue"]).toHaveLength(2);
		expect(state.color.curves.master).toHaveLength(3);
		expect(state.color.secondaryCurves).toMatchObject({
			enabled: true,
			mix: 100,
		});
		expect(
			state.color.secondaryCurves.hueVsSaturation.points.length
		).toBeGreaterThan(3);
		expect(state.color.secondaryCurves.hueVsHue.points.length).toBeGreaterThan(
			2
		);
		expect(state.color.secondaryCurves.hueVsLuminance.points).toHaveLength(3);
		expect(
			state.color.secondaryCurves.luminanceVsSaturation.points
		).toHaveLength(3);
		expect(
			state.color.secondaryCurves.saturationVsSaturation.points
		).toHaveLength(3);
		expect(
			state.color.secondaryCurves.hueVsSaturation.samples.some(
				(value: number) => Math.abs(value - 0.5) > 0.01
			)
		).toBe(true);
		expect(
			state.color.curveShapeKeyframes["secondaryCurves.hueVsSaturation"]
		).toHaveLength(2);
		expect(state.color.wheels.shadows.x).toBeLessThan(0);
		expect(state.color.wheels.offset.x).toBeGreaterThan(0);
		expect(state.color.wheels.strength).toBe(80);
		expect(state.color.wheels.mode).toBe("lift-gamma-gain");
		expect(state.color.mask.maskIds).toHaveLength(1);
		expect(state.color.management).toMatchObject({
			enabled: true,
			inputSpace: "display-p3",
			workingSpace: "acescg",
			outputSpace: "rec709",
			toneMapping: "aces",
			peakNits: 1_000,
		});
		expect(state.masks).toHaveLength(1);
		expect(state.legacy).toMatchObject({ saturation: 0 });

		const nativeOutput = "/tmp/qcut-color-native-e2e.mp4";
		const nativeProof = "/tmp/qcut-color-native-proof.mp4";
		const muxerProof = "/tmp/qcut-color-muxer-proof.mp4";
		await rm(nativeOutput, { force: true });
		await rm(nativeProof, { force: true });
		await rm(muxerProof, { force: true });
		await electronApp.evaluate(async ({ dialog }) => {
			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: "/tmp/qcut-color-native-e2e.mp4",
			});
		});
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await page.getByTestId("export-quality-select").click();
		await page.getByText("854×480", { exact: true }).click();
		await page.getByTestId("export-start-button").click();
		await expect
			.poll(
				async () => {
					try {
						return (await stat(nativeOutput)).size;
					} catch {
						return 0;
					}
				},
				{ timeout: 120_000, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(1_000);
		await copyFile(nativeOutput, nativeProof);

		await expect(page.getByTestId("export-start-button")).toBeEnabled({
			timeout: 30_000,
		});
		const muxerLogs: string[] = [];
		page.on("console", (message) => muxerLogs.push(message.text()));
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});
		await page.getByRole("button", { name: "Close export dialog" }).click();
		await page.evaluate(() => {
			const state = (window as any).__timelineStore.getState();
			const track = state.tracks.find((candidate: any) =>
				candidate.elements.some((element: any) => element.type === "media")
			);
			const element = track?.elements.find(
				(candidate: any) => candidate.type === "media"
			);
			if (!track || !element) throw new Error("Media element missing");
			state.updateMediaElement(track.id, element.id, { duration: 1 }, true);
		});
		await rm(nativeOutput, { force: true });
		await electronApp.evaluate(async ({ dialog }) => {
			dialog.showSaveDialog = async () => ({
				canceled: false,
				filePath: "/tmp/qcut-color-native-e2e.mp4",
			});
		});
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await expect(page.getByText("1.00s", { exact: true })).toBeVisible();
		await page.getByTestId("export-quality-select").click();
		await page.getByText("854×480", { exact: true }).click();
		const includeAudio = page.getByRole("checkbox", {
			name: "Include audio in export",
		});
		if ((await includeAudio.count()) > 0 && (await includeAudio.isChecked())) {
			await includeAudio.click();
		}
		await page.getByTestId("export-start-button").click();
		await expect
			.poll(
				async () => {
					try {
						return (await stat(nativeOutput)).size;
					} catch {
						return 0;
					}
				},
				{ timeout: 120_000, intervals: [500, 1_000, 2_000] }
			)
			.toBeGreaterThan(1_000);
		await copyFile(nativeOutput, muxerProof);
		expect(
			muxerLogs.some(
				(message) =>
					message.includes("MUXER") || message.includes("Muxer (mediabunny)")
			)
		).toBe(true);
		expectRenderParity({ nativePath: nativeProof, muxerPath: muxerProof });
	});
});
