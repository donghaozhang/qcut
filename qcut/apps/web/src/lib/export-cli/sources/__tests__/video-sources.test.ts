import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { extractVideoSources } from "../video-sources";

describe("extractVideoSources", () => {
	it("carries per-clip visual properties and keyframes to FFmpeg", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-1",
						type: "media",
						mediaId: "asset-1",
						name: "Video",
						duration: 3,
						startTime: 1,
						trimStart: 0.25,
						trimEnd: 0.5,
						x: 42,
						scaleX: 0.8,
						scaleY: 0.7,
						flipVertical: true,
						crop: { top: 0.1, right: 0, bottom: 0, left: 0.05 },
						keyframes: {
							x: [{ id: "x0", frame: 0, value: 0, easing: "linear" }],
						},
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "asset-1",
				name: "video.mp4",
				type: "video",
				file: new File([], "video.mp4"),
				localPath: "/tmp/video.mp4",
			},
		];
		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/video.mp4" },
			() => undefined,
			60
		);
		expect(sources).toHaveLength(1);
		expect(sources[0]).toMatchObject({
			path: "/tmp/video.mp4",
			trackId: "main",
			trackOrder: 0,
			elementOrder: 0,
			startTime: 1,
			duration: 3,
			trimStart: 0.25,
			trimEnd: 0.5,
			visual: {
				x: 42,
				scaleX: 0.8,
				scaleY: 0.7,
				flipVertical: true,
				keyframeFps: 60,
			},
		});
		expect(sources[0].visual?.keyframes?.x).toHaveLength(1);
	});

	it("resolves a library filter into a transient LUT for Electron export", async () => {
		const persistedColor = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			filter: { presetId: "teal-gold", presetVersion: 1, intensity: 64 },
		};
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-filtered",
						type: "media",
						mediaId: "asset-filtered",
						name: "Filtered video",
						duration: 2,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						color: persistedColor,
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "asset-filtered",
				name: "filtered.mp4",
				type: "video",
				file: new File([], "filtered.mp4"),
				localPath: "/tmp/filtered.mp4",
			},
		];

		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/filtered.mp4" },
			() => undefined
		);

		expect(persistedColor.lut.cube).toBeUndefined();
		expect(sources[0].visual?.color).toMatchObject({
			filter: { presetId: "teal-gold", presetVersion: 1, intensity: 64 },
			lut: {
				enabled: true,
				presetId: "filter:teal-gold",
				intensity: 64,
			},
		});
		expect(sources[0].visual?.color.lut.cube?.values).toHaveLength(17 ** 3 * 3);
	});

	it("exports a generated alpha video while retaining geometric masks", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-cutout",
						type: "media",
						mediaId: "original",
						name: "Cutout video",
						duration: 3,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						masks: [
							{
								id: "person",
								name: "Person",
								enabled: true,
								type: "person",
								blendMode: "add",
								centerX: 0.5,
								centerY: 0.5,
								width: 1,
								height: 1,
								rotation: 0,
								feather: 0,
								invert: false,
								sourceMediaId: "person-alpha",
								stroke: {
									style: "glow",
									color: "#20c7d9",
									width: 6,
									opacity: 0.8,
									glow: 12,
									offsetX: 0,
									offsetY: 0,
								},
							},
							{
								id: "crop-mask",
								name: "Crop mask",
								enabled: true,
								type: "rectangle",
								blendMode: "intersect",
								centerX: 0.5,
								centerY: 0.5,
								width: 0.5,
								height: 0.5,
								rotation: 0,
								feather: 0,
								invert: false,
							},
						],
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "original",
				name: "original.mp4",
				type: "video",
				file: new File([], "original.mp4"),
				localPath: "/tmp/original.mp4",
			},
			{
				id: "person-alpha",
				name: "person-alpha.webm",
				type: "video",
				file: new File([], "person-alpha.webm"),
				localPath: "/tmp/person-alpha.webm",
			},
		];

		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/generated.webm" },
			() => undefined
		);

		expect(sources[0].path).toBe("/tmp/person-alpha.webm");
		expect(sources[0].visual?.masks).toHaveLength(1);
		expect(sources[0].visual?.masks?.[0]).toMatchObject({
			id: "crop-mask",
			type: "rectangle",
			blendMode: "intersect",
		});
		expect(sources[0].visual?.mask).toMatchObject({
			type: "none",
			stroke: { style: "glow", width: 6 },
		});
	});

	it("falls back to the original visual when generated mask media is missing", async () => {
		const logs: string[] = [];
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-cutout",
						type: "media",
						mediaId: "original",
						name: "Cutout video",
						duration: 3,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						masks: [
							{
								id: "missing-person",
								name: "Person",
								enabled: true,
								type: "person",
								blendMode: "add",
								centerX: 0.5,
								centerY: 0.5,
								width: 1,
								height: 1,
								rotation: 0,
								feather: 0,
								invert: false,
								sourceMediaId: "missing-alpha",
							},
						],
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "original",
				name: "original.mp4",
				type: "video",
				file: new File([], "original.mp4"),
				localPath: "/tmp/original.mp4",
			},
		];

		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{ saveTemp: async () => "/tmp/original.mp4" },
			(...values) => logs.push(values.join(" "))
		);

		expect(sources[0].path).toBe("/tmp/original.mp4");
		expect(sources[0].visual?.masks).toEqual([]);
		expect(logs.join("\n")).toContain(
			"Generated mask media missing-alpha is unavailable"
		);
	});

	it("materializes a generated alpha blob for FFmpeg", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					{
						id: "video-cutout",
						type: "media",
						mediaId: "original",
						name: "Cutout video",
						duration: 3,
						startTime: 0,
						trimStart: 0,
						trimEnd: 0,
						masks: [
							{
								id: "person",
								name: "Person",
								enabled: true,
								type: "person",
								blendMode: "add",
								centerX: 0.5,
								centerY: 0.5,
								width: 1,
								height: 1,
								rotation: 0,
								feather: 0,
								invert: false,
								sourceMediaId: "person-alpha",
							},
						],
					},
				],
			},
		];
		const mediaItems: MediaItem[] = [
			{
				id: "original",
				name: "original.mp4",
				type: "video",
				file: new File([], "original.mp4"),
				localPath: "/tmp/original.mp4",
			},
			{
				id: "person-alpha",
				name: "person-alpha.webm",
				type: "video",
				file: new File(["alpha"], "person-alpha.webm"),
			},
		];
		const savedFiles: string[] = [];

		const sources = await extractVideoSources(
			tracks,
			mediaItems,
			"session",
			{
				saveTemp: async (_data, filename) => {
					savedFiles.push(filename);
					return "/tmp/person-alpha-materialized.webm";
				},
			},
			() => undefined
		);

		expect(savedFiles).toEqual(["person-alpha.webm"]);
		expect(sources[0].path).toBe("/tmp/person-alpha-materialized.webm");
	});
});
