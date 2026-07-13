import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractAudioWaveform } from "../ffmpeg/audio-waveform";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const tempDirectory = path.resolve(__dirname, "../../.tmp/audio-waveform-real");
const sourcePath = path.join(
	tempDirectory,
	`five-minute-source-${process.pid}.m4a`
);
const duration = 5 * 60;

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"audio waveform - real FFmpeg",
	{ timeout: 60_000 },
	() => {
		beforeAll(() => {
			fs.rmSync(tempDirectory, { recursive: true, force: true });
			fs.mkdirSync(tempDirectory, { recursive: true });
			const generated = spawnSync(
				ffmpegPath,
				[
					"-y",
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					`sine=frequency=440:duration=${duration}:sample_rate=8000`,
					"-af",
					`volume='0.1+0.8*t/${duration}':eval=frame`,
					"-c:a",
					"aac",
					"-b:a",
					"24k",
					sourcePath,
				],
				{ encoding: "utf8", timeout: 30_000 }
			);
			expect(generated.status, generated.stderr).toBe(0);
		});

		afterAll(() => {
			fs.rmSync(tempDirectory, { recursive: true, force: true });
		});

		it("keeps a long source bounded and reuses its disk cache", async () => {
			const options = { sourcePath, duration, peakCount: 512 };
			const [first, shared] = await Promise.all([
				extractAudioWaveform({ options }),
				extractAudioWaveform({ options }),
			]);
			const cached = await extractAudioWaveform({ options });

			expect(first.cacheHit).toBe(false);
			expect(shared.cacheHit).toBe(false);
			expect(cached.cacheHit).toBe(true);
			expect(first.values).toHaveLength(512);
			expect(first.values.byteLength).toBe(2_048);
			expect(Math.max(...first.values)).toBeGreaterThan(0.02);
			expect([...cached.values]).toEqual([...first.values]);
		});
	}
);
