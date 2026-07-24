import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { app, BrowserWindow, net, protocol } from "electron";
import { getFFmpegPath, getFFprobePath } from "../electron/ffmpeg/paths";
import {
	cleanupHyperframesRender,
	renderHyperframesComposition,
} from "../electron/hyperframes/renderer";
import { registerHyperframesProtocol } from "../electron/hyperframes/protocol";
import { HyperframesSessionRegistry } from "../electron/hyperframes/session-registry";

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 12;
const DURATION_SECONDS = 1;

protocol.registerSchemesAsPrivileged([
	{
		scheme: "qcut-hyperframes",
		privileges: {
			secure: true,
			standard: true,
			supportFetchAPI: true,
			corsEnabled: true,
			bypassCSP: false,
			stream: true,
		},
	},
]);
app.on("window-all-closed", (event) => event.preventDefault());

const FIXTURE_HTML = `<!doctype html>
<html lang="en" data-composition-variables='[{"id":"title","type":"string","label":"Title","default":"HyperFrames"}]'>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}">
    <title>QCut HyperFrames smoke fixture</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }
      #stage {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
      }
      #box {
        position: absolute;
        top: 46px;
        left: 20px;
        width: 72px;
        height: 72px;
        border-radius: 8px;
        background: rgba(0, 220, 180, 0.82);
        border: 4px solid rgba(255, 255, 255, 0.95);
      }
      #title {
        position: absolute;
        left: 20px;
        bottom: 16px;
        color: white;
        font: 700 18px/1 sans-serif;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-root="true"
      data-composition-id="main"
      data-start="0"
      data-duration="${DURATION_SECONDS}"
      data-width="${WIDTH}"
      data-height="${HEIGHT}"
    >
      <div id="box"></div>
      <div id="title"></div>
      <audio
        id="tone"
        src="tone.wav"
        data-start="0"
        data-duration="${DURATION_SECONDS}"
        data-volume="0.2"
        preload="auto"
      ></audio>
    </div>
    <script>
      (() => {
        const box = document.getElementById("box");
        const title = document.getElementById("title");
        const tone = document.getElementById("tone");
        let currentTime = 0;
        let playbackRate = 1;

        title.textContent = window.__hfVariables?.title || "HyperFrames";
        const render = (value) => {
          currentTime = Math.max(0, Math.min(${DURATION_SECONDS}, Number(value) || 0));
          const progress = currentTime / ${DURATION_SECONDS};
          box.style.transform = "translateX(" + Math.round(progress * 200) + "px) rotate(" + Math.round(progress * 180) + "deg)";
          box.style.opacity = String(0.35 + progress * 0.65);
          tone.volume = Math.min(1, 0.2 + progress * 0.6);
        };
        const timeline = {
          duration: () => ${DURATION_SECONDS},
          time: () => currentTime,
          totalTime: (value) => {
            render(value);
            return timeline;
          },
          seek: (value) => {
            render(value);
            return timeline;
          },
          play: () => timeline,
          pause: () => timeline,
          timeScale: (value) => {
            if (value !== undefined) playbackRate = value;
            return playbackRate;
          },
        };
        window.__timelines = { main: timeline };
        render(0);
      })();
    </script>
  </body>
</html>`;

interface ProbeStream {
	codec_type?: string;
	codec_name?: string;
	pix_fmt?: string;
	channels?: number;
	sample_rate?: string;
}

interface ProbeResult {
	streams?: ProbeStream[];
	format?: { duration?: string };
}

interface BrowserVideoProbe {
	success: boolean;
	canPlayType: string;
	duration?: number;
	width?: number;
	height?: number;
	alphaMin?: number;
	alphaMax?: number;
	error?: string;
}

function runCommand({ command, args }: { command: string; args: string[] }): {
	stdout: Buffer;
	stderr: string;
} {
	const result = spawnSync(command, args, {
		encoding: null,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${path.basename(command)} failed (${result.status ?? "unknown"}): ${String(result.stderr).trim()}`
		);
	}
	return {
		stdout: Buffer.from(result.stdout ?? []),
		stderr: String(result.stderr ?? ""),
	};
}

function assertCondition({
	condition,
	message,
}: {
	condition: unknown;
	message: string;
}): asserts condition {
	if (!condition) throw new Error(message);
}

function parseProbe({ output }: { output: Buffer }): ProbeResult {
	const parsed: unknown = JSON.parse(output.toString("utf8"));
	assertCondition({
		condition: parsed && typeof parsed === "object",
		message: "ffprobe returned an invalid payload.",
	});
	return parsed as ProbeResult;
}

function extractRgbaFrame({
	ffmpegPath,
	outputPath,
	time,
}: {
	ffmpegPath: string;
	outputPath: string;
	time: number;
}): Buffer {
	return runCommand({
		command: ffmpegPath,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			String(time),
			"-i",
			outputPath,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"-",
		],
	}).stdout;
}

function inspectAlpha({ frame }: { frame: Buffer }): {
	min: number;
	max: number;
} {
	let min = 255;
	let max = 0;
	for (let index = 3; index < frame.length; index += 4) {
		min = Math.min(min, frame[index]);
		max = Math.max(max, frame[index]);
	}
	return { min, max };
}

async function probeBrowserVideo({
	outputUrl,
}: {
	outputUrl: string;
}): Promise<BrowserVideoProbe> {
	const window = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
		},
	});
	try {
		await window.loadURL("about:blank");
		const result: unknown = await window.webContents.executeJavaScript(
			`(() => new Promise((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        const playability = () => video.canPlayType('video/webm; codecs="vp9, opus"');
        const timeout = setTimeout(() => resolve({
          success: false,
          canPlayType: playability(),
          error: "Timed out loading rendered video",
        }), 10000);
        const finish = (payload) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({
            canPlayType: playability(),
            ...payload,
          });
        };
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.onloadeddata = async () => {
          try {
            video.currentTime = Math.min(0.75, Math.max(0, video.duration / 2));
            await new Promise((seeked) => {
              if (video.seeking) {
                video.addEventListener("seeked", seeked, { once: true });
              } else {
                seeked();
              }
            });
            await new Promise((painted) =>
              requestAnimationFrame(() => requestAnimationFrame(() => painted()))
            );
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d");
            context.drawImage(video, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let alphaMin = 255;
            let alphaMax = 0;
            for (let index = 3; index < pixels.length; index += 4) {
              alphaMin = Math.min(alphaMin, pixels[index]);
              alphaMax = Math.max(alphaMax, pixels[index]);
            }
            finish({
              success: true,
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
              alphaMin,
              alphaMax,
            });
          } catch (error) {
            finish({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };
        video.onerror = () => finish({
          success: false,
          error: video.error?.message || "Video decode failed",
        });
        video.src = ${JSON.stringify(outputUrl)};
        document.body.appendChild(video);
        video.load();
      }))()`,
			true
		);
		return result as BrowserVideoProbe;
	} finally {
		window.destroy();
	}
}

async function runSmoke(): Promise<void> {
	const ffmpegPath = getFFmpegPath();
	const ffprobePath = await getFFprobePath();
	const projectPath = await fs.mkdtemp(
		path.join(app.getPath("temp"), "qcut-hyperframes-smoke-")
	);
	const sourcePath = path.join(projectPath, "index.html");
	const tonePath = path.join(projectPath, "tone.wav");
	const registry = new HyperframesSessionRegistry();
	let outputSessionId: string | undefined;
	let protocolRegistered = false;

	try {
		registerHyperframesProtocol({
			targetProtocol: protocol,
			registry,
		});
		protocolRegistered = true;
		await fs.writeFile(sourcePath, FIXTURE_HTML, "utf8");
		runCommand({
			command: ffmpegPath,
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"lavfi",
				"-i",
				`sine=frequency=660:sample_rate=48000:duration=${DURATION_SECONDS}`,
				"-ac",
				"2",
				"-c:a",
				"pcm_s16le",
				"-y",
				tonePath,
			],
		});

		const progressValues: number[] = [];
		const result = await renderHyperframesComposition({
			options: {
				renderId: `smoke-${Date.now()}`,
				elementId: "smoke-element",
				sourcePath,
				variables: { title: "QCut + HyperFrames" },
				width: WIDTH,
				height: HEIGHT,
				fps: FPS,
				duration: DURATION_SECONDS,
			},
			registry,
			onProgress: ({ progress }) => progressValues.push(progress),
		});
		assertCondition({
			condition:
				result.success &&
				result.outputPath &&
				result.outputUrl &&
				result.sessionId,
			message: result.error || "HyperFrames renderer did not return an output.",
		});
		const outputPath = result.outputPath;
		outputSessionId = result.sessionId;
		const rangeResponse = await net.fetch(result.outputUrl, {
			headers: { Range: "bytes=0-31" },
		});
		assertCondition({
			condition:
				rangeResponse.status === 206 &&
				rangeResponse.headers.get("content-type") === "video/webm" &&
				(await rangeResponse.arrayBuffer()).byteLength === 32,
			message: "HyperFrames output protocol did not serve a valid byte range.",
		});
		const browserVideo = await probeBrowserVideo({
			outputUrl: result.outputUrl,
		});
		assertCondition({
			condition:
				browserVideo.success &&
				browserVideo.width === WIDTH &&
				browserVideo.height === HEIGHT &&
				browserVideo.alphaMin === 0 &&
				(browserVideo.alphaMax ?? 0) > 0,
			message: `Electron could not decode the HyperFrames output URL: ${JSON.stringify(browserVideo)}.`,
		});

		const probe = parseProbe({
			output: runCommand({
				command: ffprobePath,
				args: [
					"-v",
					"error",
					"-show_entries",
					"stream=codec_type,codec_name,pix_fmt,channels,sample_rate:format=duration",
					"-of",
					"json",
					outputPath,
				],
			}).stdout,
		});
		const videoStream = probe.streams?.find(
			(stream) => stream.codec_type === "video"
		);
		const audioStream = probe.streams?.find(
			(stream) => stream.codec_type === "audio"
		);
		const duration = Number(probe.format?.duration);
		assertCondition({
			condition:
				videoStream?.codec_name === "prores" &&
				videoStream.pix_fmt?.startsWith("yuva444p"),
			message: `Expected alpha ProRes video, received ${JSON.stringify(videoStream)}.`,
		});
		assertCondition({
			condition:
				audioStream?.codec_name === "pcm_s16le" &&
				audioStream.channels === 2 &&
				audioStream.sample_rate === "48000",
			message: `Expected 48kHz stereo PCM audio, received ${JSON.stringify(audioStream)}.`,
		});
		assertCondition({
			condition: duration >= 0.95 && duration <= 1.05,
			message: `Expected a one-second output, received ${duration}s.`,
		});

		const firstFrame = extractRgbaFrame({
			ffmpegPath,
			outputPath,
			time: 0,
		});
		const laterFrame = extractRgbaFrame({
			ffmpegPath,
			outputPath,
			time: 0.75,
		});
		const expectedFrameBytes = WIDTH * HEIGHT * 4;
		assertCondition({
			condition:
				firstFrame.length === expectedFrameBytes &&
				laterFrame.length === expectedFrameBytes,
			message: "FFmpeg did not decode complete RGBA frames.",
		});
		const firstHash = createHash("sha256").update(firstFrame).digest("hex");
		const laterHash = createHash("sha256").update(laterFrame).digest("hex");
		assertCondition({
			condition: firstHash !== laterHash,
			message: "Rendered HyperFrames animation is frozen.",
		});
		const alpha = inspectAlpha({ frame: laterFrame });
		assertCondition({
			condition: alpha.min === 0 && alpha.max > 0,
			message: `Expected transparent and visible pixels, received alpha range ${alpha.min}-${alpha.max}.`,
		});

		const audioBytes = runCommand({
			command: ffmpegPath,
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-i",
				outputPath,
				"-map",
				"0:a:0",
				"-f",
				"s16le",
				"-acodec",
				"pcm_s16le",
				"-",
			],
		}).stdout;
		assertCondition({
			condition: audioBytes.some((value) => value !== 0),
			message: "Rendered HyperFrames audio is silent.",
		});
		assertCondition({
			condition:
				progressValues.length === FPS + 1 &&
				progressValues.at(-2) === 90 &&
				progressValues.at(-1) === 100 &&
				result.frameCount === FPS,
			message: `Unexpected render progress: ${JSON.stringify(progressValues)}.`,
		});

		console.log(
			`HYPERFRAMES_SMOKE_RESULT=${JSON.stringify({
				success: true,
				videoCodec: videoStream.codec_name,
				pixelFormat: videoStream.pix_fmt,
				audioCodec: audioStream.codec_name,
				duration,
				frameCount: result.frameCount,
				outputUrl: result.outputUrl,
				browserVideo,
				firstHash,
				laterHash,
				alpha,
			})}`
		);
	} finally {
		if (outputSessionId) {
			await cleanupHyperframesRender({ sessionId: outputSessionId });
		}
		if (protocolRegistered) {
			protocol.unhandle("qcut-hyperframes");
		}
		await fs.rm(projectPath, { recursive: true, force: true });
	}
}

void app.whenReady().then(async () => {
	try {
		await runSmoke();
		app.exit(0);
	} catch (error) {
		console.error(
			"HYPERFRAMES_SMOKE_ERROR",
			error instanceof Error ? error.stack || error.message : String(error)
		);
		app.exit(1);
	}
});
