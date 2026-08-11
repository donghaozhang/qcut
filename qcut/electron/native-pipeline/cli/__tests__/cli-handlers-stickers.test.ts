import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	handleStickerOverlay,
	handleStickerSearch,
	type StickerOverlayDependencies,
} from "../cli-handlers-stickers";
import { parseCliArgs } from "../cli";
import type { CLIRunOptions } from "../cli-runner/types";

function baseOptions({
	command,
	outputDir,
}: {
	command: string;
	outputDir: string;
}): CLIRunOptions {
	return {
		command,
		outputDir,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

describe("sticker CLI", () => {
	test("parses grouped search and overlay commands", () => {
		const search = parseCliArgs([
			"edit",
			"sticker-search",
			"--query",
			"warning",
			"--collection",
			"fluent-emoji",
			"--limit",
			"8",
		]);
		const overlay = parseCliArgs([
			"edit",
			"sticker-overlay",
			"-i",
			"video.mp4",
			"--plan",
			"stickers.json",
			"--output",
			"enhanced.mp4",
		]);

		expect(search).toMatchObject({
			command: "sticker-search",
			query: "warning",
			collection: "fluent-emoji",
			limit: 8,
		});
		expect(overlay).toMatchObject({
			command: "sticker-overlay",
			input: "video.mp4",
			plan: "stickers.json",
			output: "enhanced.mp4",
		});
	});

	test("returns structured sticker search results", async () => {
		const dependencies: StickerOverlayDependencies = {
			search: async ({ query, collection }) => ({
				query,
				collection,
				total: 1,
				results: [
					{
						id: "fluent-emoji:warning",
						collection: "fluent-emoji",
						icon: "warning",
						name: "Warning",
						previewUrl: "https://example.test/warning.svg",
					},
				],
			}),
			materialize: async () => {
				throw new Error("unexpected materialize");
			},
			probeVideo: async () => {
				throw new Error("unexpected probe");
			},
			renderVideo: async () => {
				throw new Error("unexpected render");
			},
		};
		const result = await handleStickerSearch(
			{
				...baseOptions({ command: "sticker-search", outputDir: "/tmp" }),
				query: "warning",
				collection: "fluent-emoji",
			},
			() => undefined,
			new AbortController().signal,
			dependencies
		);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			total: 1,
			results: [{ id: "fluent-emoji:warning" }],
		});
	});

	test("materializes, renders, and verifies a timed overlay plan", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-stickers-"));
		const input = join(directory, "input.mp4");
		const output = join(directory, "enhanced.mp4");
		const plan = join(directory, "stickers.json");
		const sound = join(directory, "pop.ogg");
		writeFileSync(input, "video");
		writeFileSync(sound, "audio");
		writeFileSync(
			plan,
			JSON.stringify({
				version: 1,
				stickers: [
					{
						stickerId: "fluent-emoji:warning",
						startTime: 1,
						duration: 1.5,
						x: 40,
						y: 80,
						width: 220,
						soundEffect: {
							source: "pop.ogg",
							duration: 0.8,
						},
					},
				],
			})
		);
		let renderArgs: string[] = [];
		const dependencies: StickerOverlayDependencies = {
			search: async () => {
				throw new Error("unexpected search");
			},
			materialize: async ({ item, outputDirectory }) => {
				const path = join(outputDirectory, "warning.png");
				writeFileSync(path, "png");
				return { item, path };
			},
			probeVideo: async ({ filePath }) => ({
				duration: filePath === input ? 10 : 10.01,
				width: 1080,
				height: 1920,
				hasAudio: true,
			}),
			renderVideo: async ({ args }) => {
				renderArgs = args;
				writeFileSync(args.at(-1) ?? "", "rendered");
			},
		};
		const result = await handleStickerOverlay(
			{
				...baseOptions({ command: "sticker-overlay", outputDir: directory }),
				input,
				output,
				plan,
			},
			() => undefined,
			new AbortController().signal,
			dependencies
		);

		expect(result.success).toBe(true);
		expect(existsSync(output)).toBe(true);
		expect(renderArgs).toContain(sound);
		expect(result.data).toMatchObject({
			stickerCount: 1,
			soundEffectCount: 1,
			width: 1080,
			height: 1920,
		});
	});

	test("keeps an existing forced output when rendering fails", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-stickers-"));
		const input = join(directory, "input.mp4");
		const output = join(directory, "enhanced.mp4");
		const plan = join(directory, "stickers.json");
		writeFileSync(input, "video");
		writeFileSync(output, "stable output");
		writeFileSync(
			plan,
			JSON.stringify({
				version: 1,
				stickers: [
					{
						stickerId: "fluent-emoji-flat:warning",
						startTime: 1,
						duration: 1,
						x: 40,
						y: 80,
						width: 220,
					},
				],
			})
		);
		const result = await handleStickerOverlay(
			{
				...baseOptions({ command: "sticker-overlay", outputDir: directory }),
				input,
				output,
				plan,
				force: true,
			},
			() => undefined,
			new AbortController().signal,
			{
				search: async () => {
					throw new Error("unexpected search");
				},
				materialize: async ({ item, outputDirectory }) => {
					const path = join(outputDirectory, "warning.png");
					writeFileSync(path, "png");
					return { item, path };
				},
				probeVideo: async () => ({
					duration: 10,
					width: 1080,
					height: 1920,
					hasAudio: true,
				}),
				renderVideo: async () => {
					throw new Error("encoder stopped");
				},
			}
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("encoder stopped");
		expect(readFileSync(output, "utf8")).toBe("stable output");
	});
});
