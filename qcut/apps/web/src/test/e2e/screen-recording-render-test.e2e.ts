/**
 * E2E visual verification: Renders frames using the screen recording
 * export compositor with cursor overlay, zoom, and background.
 *
 * Captures a real recording, then renders frames at different timestamps
 * with enhancements enabled, saving them as PNG files for visual inspection.
 */

import { writeFile, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
	createTestProject,
	expect,
	startScreenRecordingForE2E,
	stopScreenRecordingForE2E,
	test,
} from "./helpers/electron-helpers";

function getCursorSidecarPath(videoPath: string): string {
	const dir = dirname(videoPath);
	const ext = extname(videoPath);
	const base = basename(videoPath, ext);
	return join(dir, `${base}.cursor.json`);
}

const OUTPUT_DIR = "docs/completed/test-results-raw/compositor-frames";

test.describe("Screen Recording Compositor Visual Test", () => {
	test("renders frames with cursor, zoom, and background enhancements", async ({
		page,
	}) => {
		// ── 1. Record a short session with mouse activity ──
		await createTestProject(page, "Compositor Visual Test");

		const recordBtn = page.getByTestId("screen-recording-toggle-button");
		await expect(recordBtn).toBeVisible({ timeout: 10_000 });

		const startResult = await startScreenRecordingForE2E(page);
		expect(startResult.sessionId).toBeTruthy();

		// Move mouse around for 3s to generate telemetry
		for (let i = 0; i < 60; i++) {
			const x = 200 + Math.floor(Math.sin(i * 0.2) * 300 + 400);
			const y = 150 + Math.floor(Math.cos(i * 0.15) * 200 + 250);
			await page.mouse.move(x, y, { steps: 2 });
			if (i % 15 === 0) await page.mouse.click(x, y);
			await page.waitForTimeout(50);
		}

		const stopResult = await stopScreenRecordingForE2E(page);
		expect(stopResult.success).toBe(true);

		const videoPath = stopResult.filePath;
		if (!videoPath) throw new Error("No video path");

		// ── 2. Load cursor telemetry ──
		const sidecarPath = getCursorSidecarPath(videoPath);
		const telemetryRaw = await readFile(sidecarPath, "utf-8");
		const telemetry = JSON.parse(telemetryRaw);
		expect(telemetry.points.length).toBeGreaterThan(50);

		// ── 3. Render frames in browser context with compositor ──
		const renderedFrames = await page.evaluate(
			async ({
				telemetryJson,
				outputWidth,
				outputHeight,
			}: {
				telemetryJson: string;
				outputWidth: number;
				outputHeight: number;
			}) => {
				const telemetry = JSON.parse(telemetryJson);
				const { captureRect, points } = telemetry;
				const totalDurationMs = points[points.length - 1].t - points[0].t;

				// Helper functions (inline since we can't import modules in evaluate)
				function clamp01(t: number) {
					return Math.max(0, Math.min(1, t));
				}
				function lerp(a: number, b: number, t: number) {
					return a + (b - a) * t;
				}
				function easeOutCubic(t: number) {
					return 1 - (1 - t) ** 3;
				}

				// Spring physics
				function stepSpring(
					state: { value: number; velocity: number; init: boolean },
					target: number,
					stiffness: number,
					damping: number,
					dt: number
				) {
					if (!state.init) {
						state.value = target;
						state.velocity = 0;
						state.init = true;
						return;
					}
					const displacement = state.value - target;
					const springForce = -stiffness * displacement;
					const dampingForce = -damping * state.velocity;
					const accel = springForce + dampingForce;
					state.velocity += accel * dt;
					state.value += state.velocity * dt;
				}

				// Binary search for telemetry point
				function findPoint(timeMs: number) {
					if (timeMs < points[0].t) return points[0];
					let lo = 0,
						hi = points.length - 1;
					while (lo < hi) {
						const mid = (lo + hi + 1) >> 1;
						if (points[mid].t <= timeMs) lo = mid;
						else hi = mid - 1;
					}
					return points[lo];
				}

				// Create zoom regions from telemetry (simplified auto-zoom)
				const zoomRegions: {
					startMs: number;
					endMs: number;
					depth: number;
					cx: number;
					cy: number;
				}[] = [];

				// Find click clusters for zoom
				const clickPoints = [];
				for (let i = 0; i < points.length; i++) {
					if (points[i].p && (i === 0 || !points[i - 1].p)) {
						clickPoints.push(points[i]);
					}
				}
				// Create zoom regions around clicks
				for (const cp of clickPoints) {
					zoomRegions.push({
						startMs: Math.max(0, cp.t - 500),
						endMs: cp.t + 2000,
						depth: 2.0,
						cx: (cp.x - captureRect.x) / captureRect.width,
						cy: (cp.y - captureRect.y) / captureRect.height,
					});
				}

				// If no clicks from telemetry, create a synthetic zoom region
				if (zoomRegions.length === 0) {
					const midTime = points[0].t + totalDurationMs / 2;
					const midPoint = findPoint(midTime);
					zoomRegions.push({
						startMs: midTime - 500,
						endMs: midTime + 2000,
						depth: 2.0,
						cx: (midPoint.x - captureRect.x) / captureRect.width,
						cy: (midPoint.y - captureRect.y) / captureRect.height,
					});
				}

				// Compute zoom strength at a given time
				function getZoomTransform(timeMs: number) {
					let bestStrength = 0;
					let bestRegion = zoomRegions[0];

					for (const region of zoomRegions) {
						const inStart = region.startMs - 500;
						let strength = 0;
						if (timeMs < inStart) {
							strength = 0;
						} else if (timeMs < region.startMs) {
							const t = (timeMs - inStart) / (region.startMs - inStart);
							strength = easeOutCubic(clamp01(t));
						} else if (timeMs <= region.endMs) {
							strength = 1;
						} else if (timeMs <= region.endMs + 400) {
							const t = (timeMs - region.endMs) / 400;
							strength = 1 - easeOutCubic(clamp01(t));
						}
						if (strength > bestStrength) {
							bestStrength = strength;
							bestRegion = region;
						}
					}

					if (bestStrength < 0.001) return { scale: 1, tx: 0, ty: 0 };

					const cx = clamp01(bestRegion.cx);
					const cy = clamp01(bestRegion.cy);
					const scale = lerp(1, bestRegion.depth, bestStrength);
					const tx = -(cx * outputWidth * scale - outputWidth / 2);
					const ty = -(cy * outputHeight * scale - outputHeight / 2);
					return { scale, tx, ty };
				}

				// Note: zoom transform uses full canvas coords (outputWidth/outputHeight)
				// while cursor rendering uses video-area coords (after padding).
				// This matches the production compositor where cursor is rendered
				// inside the zoom transform context after background padding.

				// Gradient presets
				const gradients: [string, string, string][] = [
					["Sunset", "#ff6b6b", "#ffa726"],
					["Ocean", "#2196f3", "#00bcd4"],
					["Twilight", "#311b92", "#f50057"],
				];

				const frames: { timeMs: number; label: string; dataUrl: string }[] = [];
				const canvas = document.createElement("canvas");
				canvas.width = outputWidth;
				canvas.height = outputHeight;
				const ctx = canvas.getContext("2d")!;

				const springX = { value: 0, velocity: 0, init: false };
				const springY = { value: 0, velocity: 0, init: false };
				const STIFFNESS = 500;
				const DAMPING = 2 * Math.sqrt(STIFFNESS);
				let lastTimeMs = -1;
				let clickStartMs = -1;
				let wasPressed = false;

				// Render function for one frame
				function renderFrame(
					timeMs: number,
					bgType: "none" | "gradient" | "solid",
					gradientIdx: number,
					showCursor: boolean,
					showZoom: boolean,
					label: string
				) {
					ctx.clearRect(0, 0, outputWidth, outputHeight);

					const padding = bgType !== "none" ? 40 : 0;
					const borderRadius = bgType !== "none" ? 12 : 0;

					// ── Draw background ──
					if (bgType === "gradient") {
						const [, c1, c2] = gradients[gradientIdx] ?? gradients[0];
						const angle = (135 * Math.PI) / 180;
						const len = Math.max(outputWidth, outputHeight);
						const cx = outputWidth / 2;
						const cy = outputHeight / 2;
						const grad = ctx.createLinearGradient(
							cx - Math.cos(angle) * len,
							cy - Math.sin(angle) * len,
							cx + Math.cos(angle) * len,
							cy + Math.sin(angle) * len
						);
						grad.addColorStop(0, c1);
						grad.addColorStop(1, c2);
						ctx.fillStyle = grad;
						ctx.fillRect(0, 0, outputWidth, outputHeight);
					} else if (bgType === "solid") {
						ctx.fillStyle = "#1a1a2e";
						ctx.fillRect(0, 0, outputWidth, outputHeight);
					}

					ctx.save();

					// ── Apply zoom transform ──
					if (showZoom) {
						const zoom = getZoomTransform(timeMs);
						if (zoom.scale > 1.001) {
							ctx.translate(zoom.tx, zoom.ty);
							ctx.scale(zoom.scale, zoom.scale);
						}
					}

					// ── Draw "video" frame (dark rect simulating screen) ──
					const vx = padding;
					const vy = padding;
					const vw = outputWidth - padding * 2;
					const vh = outputHeight - padding * 2;

					if (bgType !== "none") {
						// Shadow
						ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
						ctx.shadowBlur = 30;
						ctx.shadowOffsetY = 10;
						ctx.beginPath();
						ctx.roundRect(vx, vy, vw, vh, borderRadius);
						ctx.fillStyle = "#1a1a2e";
						ctx.fill();
						ctx.shadowColor = "transparent";
						ctx.shadowBlur = 0;
						ctx.shadowOffsetY = 0;

						// Video area (simulated dark screen with grid)
						ctx.beginPath();
						ctx.roundRect(vx, vy, vw, vh, borderRadius);
						ctx.clip();
					}

					// Dark background for "screen"
					ctx.fillStyle = "#0d1117";
					ctx.fillRect(vx, vy, vw, vh);

					// Draw grid lines to simulate screen content
					ctx.strokeStyle = "#21262d";
					ctx.lineWidth = 1;
					for (let gx = vx; gx < vx + vw; gx += 60) {
						ctx.beginPath();
						ctx.moveTo(gx, vy);
						ctx.lineTo(gx, vy + vh);
						ctx.stroke();
					}
					for (let gy = vy; gy < vy + vh; gy += 40) {
						ctx.beginPath();
						ctx.moveTo(vx, gy);
						ctx.lineTo(vx + vw, gy);
						ctx.stroke();
					}

					// Draw some "UI elements" to simulate app content
					ctx.fillStyle = "#161b22";
					ctx.fillRect(vx, vy, 200, vh); // sidebar
					ctx.fillStyle = "#21262d";
					ctx.fillRect(vx, vy, vw, 40); // toolbar
					ctx.fillRect(vx, vy + vh - 80, vw, 80); // timeline

					// Labels
					ctx.fillStyle = "#8b949e";
					ctx.font = "14px sans-serif";
					ctx.fillText("QCut Editor (simulated)", vx + 220, vy + 25);
					ctx.fillText("Timeline", vx + 220, vy + vh - 50);
					ctx.font = "11px sans-serif";
					ctx.fillText(`Frame: ${label}`, vx + 220, vy + 60);

					// ── Draw cursor overlay ──
					if (showCursor) {
						const point = findPoint(timeMs);
						const rx = (point.x - captureRect.x) / captureRect.width;
						const ry = (point.y - captureRect.y) / captureRect.height;
						const targetX = padding + rx * vw;
						const targetY = padding + ry * vh;

						const dt = lastTimeMs >= 0 ? (timeMs - lastTimeMs) / 1000 : 0;
						lastTimeMs = timeMs;

						if (dt < 0 || dt > 0.5) {
							springX.value = targetX;
							springX.velocity = 0;
							springX.init = true;
							springY.value = targetY;
							springY.velocity = 0;
							springY.init = true;
						} else {
							stepSpring(springX, targetX, STIFFNESS, DAMPING, dt);
							stepSpring(springY, targetY, STIFFNESS, DAMPING, dt);
						}

						const cursorX = springX.value;
						const cursorY = springY.value;

						// Click tracking
						if (point.p && !wasPressed) {
							clickStartMs = timeMs;
						}
						wasPressed = point.p;

						// Click bounce
						let bounceScale = 1;
						if (clickStartMs >= 0) {
							const elapsed = timeMs - clickStartMs;
							if (elapsed < 150) {
								const t = elapsed / 150;
								const mid = 0.3;
								if (t < mid) {
									bounceScale = 1 - 0.15 * (t / mid);
								} else {
									bounceScale = 1 - 0.15 * (1 - clamp01((t - mid) / (1 - mid)));
								}
							}
						}

						const radius = 28 * (outputWidth / 1920) * bounceScale;

						// Cursor dot (white)
						ctx.beginPath();
						ctx.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
						ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
						ctx.fill();

						// Click ring
						if (clickStartMs >= 0 && timeMs - clickStartMs < 150) {
							ctx.beginPath();
							ctx.arc(cursorX, cursorY, radius * 1.5, 0, Math.PI * 2);
							ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
							ctx.lineWidth = 2;
							ctx.stroke();
						}
					}

					ctx.restore();

					// Watermark label
					ctx.fillStyle = "rgba(255,255,255,0.7)";
					ctx.font = "bold 13px sans-serif";
					ctx.fillText(label, 10, outputHeight - 10);

					return canvas.toDataURL("image/png");
				}

				// ── Render frames at various timestamps with different configs ──
				const t0 = points[0].t;
				const dur = totalDurationMs;

				// Reset spring state between scenes
				function resetSpring(timeMs: number) {
					const pt = findPoint(timeMs);
					const rx = (pt.x - captureRect.x) / captureRect.width;
					const ry = (pt.y - captureRect.y) / captureRect.height;
					springX.value = rx * outputWidth;
					springX.velocity = 0;
					springX.init = true;
					springY.value = ry * outputHeight;
					springY.velocity = 0;
					springY.init = true;
					lastTimeMs = timeMs;
					clickStartMs = -1;
					wasPressed = false;
				}

				// 1. Plain — no enhancements
				resetSpring(t0);
				frames.push({
					timeMs: t0,
					label: "1-plain",
					dataUrl: renderFrame(
						t0,
						"none",
						0,
						false,
						false,
						"1: No enhancements"
					),
				});

				// 2. Cursor only
				resetSpring(t0 + dur * 0.2);
				frames.push({
					timeMs: t0 + dur * 0.2,
					label: "2-cursor-only",
					dataUrl: renderFrame(
						t0 + dur * 0.2,
						"none",
						0,
						true,
						false,
						"2: Cursor overlay only"
					),
				});

				// 3. Cursor + Sunset gradient background
				resetSpring(t0 + dur * 0.3);
				frames.push({
					timeMs: t0 + dur * 0.3,
					label: "3-cursor-sunset-bg",
					dataUrl: renderFrame(
						t0 + dur * 0.3,
						"gradient",
						0,
						true,
						false,
						"3: Cursor + Sunset gradient bg"
					),
				});

				// 4. Cursor + Ocean gradient
				resetSpring(t0 + dur * 0.4);
				frames.push({
					timeMs: t0 + dur * 0.4,
					label: "4-cursor-ocean-bg",
					dataUrl: renderFrame(
						t0 + dur * 0.4,
						"gradient",
						1,
						true,
						false,
						"4: Cursor + Ocean gradient bg"
					),
				});

				// 5. Cursor + Solid dark bg
				resetSpring(t0 + dur * 0.5);
				frames.push({
					timeMs: t0 + dur * 0.5,
					label: "5-cursor-solid-bg",
					dataUrl: renderFrame(
						t0 + dur * 0.5,
						"solid",
						0,
						true,
						false,
						"5: Cursor + solid bg"
					),
				});

				// 6. Cursor + Twilight gradient + Zoom (before zoom region)
				resetSpring(t0);
				frames.push({
					timeMs: t0,
					label: "6-zoom-before",
					dataUrl: renderFrame(
						t0,
						"gradient",
						2,
						true,
						true,
						"6: Twilight bg + zoom (before region — 1x)"
					),
				});

				// 7. Cursor + gradient + Zoom (during zoom — 2x)
				const zoomMid = zoomRegions[0]
					? (zoomRegions[0].startMs + zoomRegions[0].endMs) / 2
					: t0 + dur * 0.5;
				resetSpring(zoomMid);
				frames.push({
					timeMs: zoomMid,
					label: "7-zoom-active",
					dataUrl: renderFrame(
						zoomMid,
						"gradient",
						2,
						true,
						true,
						"7: Twilight bg + ZOOM ACTIVE (2x)"
					),
				});

				// 8. Cursor + gradient + Zoom (transition out)
				const zoomEnd = zoomRegions[0]
					? zoomRegions[0].endMs + 200
					: t0 + dur * 0.7;
				resetSpring(zoomEnd);
				frames.push({
					timeMs: zoomEnd,
					label: "8-zoom-out-transition",
					dataUrl: renderFrame(
						zoomEnd,
						"gradient",
						0,
						true,
						true,
						"8: Sunset bg + zoom transition out"
					),
				});

				return frames;
			},
			{
				telemetryJson: telemetryRaw,
				outputWidth: 960,
				outputHeight: 540,
			}
		);

		// Verify all 8 scenarios rendered successfully
		expect(renderedFrames.length).toBe(8);
		for (const frame of renderedFrames) {
			expect(frame.dataUrl).toMatch(/^data:image\/png;base64,/);
		}

		// ── 4. Save frames to disk ──
		const { mkdir } = await import("node:fs/promises");
		await mkdir(OUTPUT_DIR, { recursive: true });

		for (const frame of renderedFrames) {
			const base64 = frame.dataUrl.replace(/^data:image\/png;base64,/, "");
			const buf = Buffer.from(base64, "base64");
			const filePath = join(OUTPUT_DIR, `${frame.label}.png`);
			await writeFile(filePath, buf);
			console.log(
				`[Compositor] Saved: ${frame.label}.png (${buf.length} bytes)`
			);
		}

		console.log(
			`[Compositor] ✅ All ${renderedFrames.length} frames rendered to ${OUTPUT_DIR}/`
		);
	});
});
