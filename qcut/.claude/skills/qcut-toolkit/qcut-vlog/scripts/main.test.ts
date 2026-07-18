import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { VlogManifest } from "./types";
import { runVlog } from "./main";

function writeExecutable({
	path,
	content,
}: {
	path: string;
	content: string;
}): void {
	writeFileSync(path, content, "utf8");
	chmodSync(path, 0o755);
}

function createFakeToolchain({ directory }: { directory: string }) {
	const invocationLog = join(directory, "invocations.log");
	const qcut = join(directory, "fake-qcut.ts");
	const ffmpeg = join(directory, "fake-ffmpeg.ts");
	const ffprobe = join(directory, "fake-ffprobe.ts");

	writeExecutable({
		path: qcut,
		content: `#!/usr/bin/env bun
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
appendFileSync(process.env.FAKE_INVOCATION_LOG, "qcut " + args.slice(0, 2).join(" ") + "\\n");
if (args[0] === "edit" && args[1] === "clean-audio") {
  const input = value("-i");
  const output = value("-o");
  const metadata = join(output, "clean-metadata");
  mkdirSync(metadata, { recursive: true });
  writeFileSync(join(metadata, "words.json"), JSON.stringify([{ id: "w-0", text: "啊", start: 1, end: 1.2, type: "word" }]));
  writeFileSync(join(metadata, "decisions.json"), JSON.stringify([{ id: "w-0", reason: "filler word", scope: "word" }]));
  writeFileSync(join(metadata, "cuts.json"), JSON.stringify([{ start: 1, end: 1.2, reason: "filler word" }]));
  writeFileSync(join(metadata, "keeps.json"), JSON.stringify([{ start: 0, end: 0.85 }, { start: 1.35, end: 10 }]));
  if (!args.includes("--dry-run")) {
    const stem = basename(input, extname(input));
    writeFileSync(join(output, stem + "_clean" + extname(input)), "clean-video");
  }
} else if (args[0] === "edit" && args[1] === "person-cutout") {
  writeFileSync(value("--cutout-output"), "transparent-person-video");
  writeFileSync(value("--output"), "editable-background-video");
} else if (args[0] === "edit" && args[1] === "portrait-filter") {
  writeFileSync(value("--output"), "portrait-video");
} else if (args[0] === "analyze" && args[1] === "transcribe") {
  const output = value("-o");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "transcription.srt"), "1\\n00:00:01,000 --> 00:00:03,000\\n第一条字幕\\n\\n2\\n00:00:03,100 --> 00:00:05,000\\n第二条字幕\\n");
} else if (args[0] === "edit" && args[1] === "subtitle-export") {
  writeFileSync(value("--output"), "final-video");
} else {
  process.exit(2);
}
`,
	});
	writeExecutable({
		path: ffmpeg,
		content: `#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const output = process.argv.at(-1);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, "ffmpeg-output");
`,
	});
	writeExecutable({
		path: ffprobe,
		content: `#!/usr/bin/env bun
process.stdout.write(JSON.stringify({ format: { duration: "10.000" } }));
`,
	});

	return { invocationLog, qcut, ffmpeg, ffprobe };
}

describe("qcut-vlog orchestration", () => {
	test("runs clean, retranscribe, subtitle, verify, then safely resumes", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-vlog-test-"));
		const input = join(directory, "episode.MOV");
		const output = join(directory, "episode-output");
		writeFileSync(input, "source-video");
		const tools = createFakeToolchain({ directory });
		const env = {
			...process.env,
			QCUT_VLOG_QCUT_BIN: tools.qcut,
			QCUT_VLOG_FFMPEG_BIN: tools.ffmpeg,
			QCUT_VLOG_FFPROBE_BIN: tools.ffprobe,
			FAKE_INVOCATION_LOG: tools.invocationLog,
		};

		const first = await runVlog({
			argv: [input, "--output-dir", output, "--json"],
			env,
			printOutput: false,
		});

		expect(first?.verification).toMatchObject({
			subtitleCount: 2,
			durationDifference: 0,
		});
		expect(first?.cleanSummary).toMatchObject({ cuts: 1, fillerCuts: 1 });
		expect(existsSync(join(output, "episode_vlog.mp4"))).toBe(true);
		expect(
			existsSync(join(output, "verification", "subtitle-preview.png"))
		).toBe(true);
		expect(
			readFileSync(tools.invocationLog, "utf8").trim().split("\n")
		).toEqual([
			"qcut edit clean-audio",
			"qcut edit portrait-filter",
			"qcut analyze transcribe",
			"qcut edit subtitle-export",
		]);
		await expect(
			runVlog({
				argv: [
					input,
					"--output-dir",
					output,
					"--resume",
					"--style",
					'{"bgOpacity":0}',
				],
				env,
				printOutput: false,
			})
		).rejects.toThrow("Workflow settings changed");
		await expect(
			runVlog({
				argv: [
					input,
					"--output-dir",
					output,
					"--resume",
					"--final-name",
					"alternate.mp4",
				],
				env,
				printOutput: false,
			})
		).rejects.toThrow("Workflow settings changed");

		await Bun.sleep(5);
		const resumed = await runVlog({
			argv: [input, "--output-dir", output, "--resume", "--json"],
			env,
			printOutput: false,
		});

		expect(resumed?.stages.clean.status).toBe("skipped");
		expect(resumed?.stages.portrait.status).toBe("skipped");
		expect(resumed?.stages["extract-audio"].status).toBe("skipped");
		expect(resumed?.stages.transcribe.status).toBe("skipped");
		expect(resumed?.stages.subtitle.status).toBe("skipped");
		expect(
			readFileSync(tools.invocationLog, "utf8").trim().split("\n")
		).toHaveLength(4);

		await Bun.sleep(10);
		writeFileSync(join(output, "episode_clean.MOV"), "updated-clean-video");
		const rebuilt = await runVlog({
			argv: [input, "--output-dir", output, "--resume", "--json"],
			env,
			printOutput: false,
		});

		expect(rebuilt?.stages.clean.status).toBe("skipped");
		expect(rebuilt?.stages.portrait.status).toBe("completed");
		expect(rebuilt?.stages["extract-audio"].status).toBe("completed");
		expect(rebuilt?.stages.transcribe.status).toBe("completed");
		expect(rebuilt?.stages.subtitle.status).toBe("completed");
		expect(
			readFileSync(tools.invocationLog, "utf8").trim().split("\n")
		).toEqual([
			"qcut edit clean-audio",
			"qcut edit portrait-filter",
			"qcut analyze transcribe",
			"qcut edit subtitle-export",
			"qcut edit portrait-filter",
			"qcut analyze transcribe",
			"qcut edit subtitle-export",
		]);

		const manifest = JSON.parse(
			readFileSync(join(output, "vlog-manifest.json"), "utf8")
		) as VlogManifest;
		expect(manifest.workflow).toBe("qcut-vlog");
		expect(manifest.verification?.previewImage).toContain(
			"subtitle-preview.png"
		);
	});

	test("composites a cutout background before creating editable and hard-captioned deliverables", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-vlog-background-"));
		const input = join(directory, "talking-head.MOV");
		const background = join(directory, "office.png");
		const output = join(directory, "vlog-output");
		writeFileSync(input, "source-video");
		writeFileSync(background, "background-image");
		const tools = createFakeToolchain({ directory });
		const env = {
			...process.env,
			QCUT_VLOG_QCUT_BIN: tools.qcut,
			QCUT_VLOG_FFMPEG_BIN: tools.ffmpeg,
			QCUT_VLOG_FFPROBE_BIN: tools.ffprobe,
			FAKE_INVOCATION_LOG: tools.invocationLog,
		};

		const first = await runVlog({
			argv: [
				input,
				"--output-dir",
				output,
				"--background",
				background,
				"--json",
			],
			env,
			printOutput: false,
		});

		const cutoutVideo = join(output, "talking-head_cutout.webm");
		const editableVideo = join(output, "talking-head_vlog_editable.mp4");
		expect(first?.stages.background.status).toBe("completed");
		expect(first?.stages.portrait.status).toBe("skipped");
		expect(first?.artifacts).toMatchObject({
			backgroundImage: background,
			cutoutVideo,
			editableVideo,
			srt: join(output, "transcription.srt"),
			finalVideo: join(output, "talking-head_vlog.mp4"),
		});
		expect(existsSync(cutoutVideo)).toBe(true);
		expect(existsSync(editableVideo)).toBe(true);
		expect(
			existsSync(join(output, "verification", "background-preview.png"))
		).toBe(true);

		const backgroundCommand = first?.commands.find(
			(command) => command.stage === "background"
		)?.command;
		const audioCommand = first?.commands.find(
			(command) => command.stage === "extract-audio"
		)?.command;
		const subtitleCommand = first?.commands.find(
			(command) => command.stage === "subtitle"
		)?.command;
		expect(backgroundCommand).toContain(background);
		expect(backgroundCommand).toContain(cutoutVideo);
		expect(backgroundCommand).toContain(editableVideo);
		expect(backgroundCommand).toContain("soft-skin");
		expect(backgroundCommand).toContain("25");
		expect(audioCommand).toContain(editableVideo);
		expect(subtitleCommand).toContain(editableVideo);

		expect(
			readFileSync(tools.invocationLog, "utf8").trim().split("\n")
		).toEqual([
			"qcut edit clean-audio",
			"qcut edit person-cutout",
			"qcut analyze transcribe",
			"qcut edit subtitle-export",
		]);

		const resumed = await runVlog({
			argv: [
				input,
				"--output-dir",
				output,
				"--background",
				background,
				"--resume",
				"--json",
			],
			env,
			printOutput: false,
		});

		expect(resumed?.stages.background.status).toBe("skipped");
		expect(
			readFileSync(tools.invocationLog, "utf8").trim().split("\n")
		).toHaveLength(4);
	});
});
