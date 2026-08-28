// @vitest-environment node
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  connectPersonCutoutProcessPipe,
  createPersonCutoutRgbaDecoderArguments,
  waitForPersonCutoutProcesses,
} from "../jianying-person-cutout/process-pipeline.js";

function spawnScript({ source }: { source: string }) {
  return spawn(process.execPath, ["-e", source], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

describe("person cutout streaming process pipeline", () => {
  it("decodes RGBA to stdout without creating a full-frame temporary file", () => {
    expect(
      createPersonCutoutRgbaDecoderArguments({
        sourcePath: "/media/source.mp4",
      }),
    ).toEqual([
      "-v",
      "error",
      "-i",
      "/media/source.mp4",
      "-map",
      "0:v:0",
      "-pix_fmt",
      "rgba",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
  });

  it("surfaces a decoder failure and terminates the bridge", async () => {
    const decoder = spawnScript({
      source: 'process.stderr.write("decode failed\\n"); process.exit(7)',
    });
    const bridge = spawnScript({
      source: "process.stdin.resume(); setInterval(() => {}, 1000)",
    });
    connectPersonCutoutProcessPipe({ consumer: bridge, producer: decoder });

    await expect(
      waitForPersonCutoutProcesses({
        processes: [
          { child: decoder, label: "视频解码" },
          { child: bridge, label: "剪映主体分析" },
        ],
      }),
    ).rejects.toThrow(/视频解码失败.*decode failed/s);
  });

  it("surfaces a bridge failure without leaking an EPIPE error", async () => {
    const decoder = spawnScript({
      source:
        "const chunk = Buffer.alloc(65536); setInterval(() => process.stdout.write(chunk), 1)",
    });
    const bridge = spawnScript({
      source: 'process.stderr.write("bridge failed\\n"); process.exit(9)',
    });
    connectPersonCutoutProcessPipe({ consumer: bridge, producer: decoder });

    await expect(
      waitForPersonCutoutProcesses({
        processes: [
          { child: decoder, label: "视频解码" },
          { child: bridge, label: "剪映主体分析" },
        ],
      }),
    ).rejects.toThrow(/剪映主体分析失败.*bridge failed/s);
  });

  it("terminates both sides when the caller aborts", async () => {
    const controller = new AbortController();
    const decoder = spawnScript({
      source: "setInterval(() => process.stdout.write('frame'), 10)",
    });
    const bridge = spawnScript({
      source: "process.stdin.resume(); setInterval(() => {}, 1000)",
    });
    connectPersonCutoutProcessPipe({ consumer: bridge, producer: decoder });
    const pending = waitForPersonCutoutProcesses({
      processes: [
        { child: decoder, label: "视频解码" },
        { child: bridge, label: "剪映主体分析" },
      ],
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
