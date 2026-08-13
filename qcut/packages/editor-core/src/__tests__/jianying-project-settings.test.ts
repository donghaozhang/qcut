import { describe, expect, it } from "vitest";
import { readDraftProjectSettings } from "../jianying-draft/import/project-settings.js";

describe("Jianying project settings", () => {
	it("uses the uniquely referenced compound draft for neutral wrapper values", () => {
		const settings = readDraftProjectSettings({
			content: {
				canvas_config: { width: 0, height: 0, ratio: "original" },
				duration: 0,
				fps: 30,
				tracks: [
					{
						segments: [
							{
								extra_material_refs: ["compound-1"],
							},
						],
					},
				],
				materials: {
					drafts: [
						{
							id: "compound-1",
							draft: {
								canvas_config: { width: 1080, height: 1920 },
								duration: 100_900_000,
								fps: 30,
							},
						},
					],
				},
			},
		});

		expect(settings).toEqual({
			width: 1080,
			height: 1920,
			fps: 30,
			durationUs: 100_900_000,
		});
	});

	it("does not borrow settings from an ambiguous compound collection", () => {
		const settings = readDraftProjectSettings({
			content: {
				canvas_config: { width: 0, height: 0 },
				duration: 0,
				fps: 30,
				materials: {
					drafts: [
						{
							id: "compound-1",
							draft: { canvas_config: { width: 1080, height: 1920 } },
						},
						{
							id: "compound-2",
							draft: { canvas_config: { width: 1920, height: 1080 } },
						},
					],
				},
			},
		});

		expect(settings).toEqual({
			width: undefined,
			height: undefined,
			fps: 30,
			durationUs: 0,
		});
	});

	it("keeps valid root values over compound metadata", () => {
		const settings = readDraftProjectSettings({
			content: {
				canvas_config: { width: 3840, height: 2160 },
				duration: 5_000_000,
				fps: 60,
				materials: {
					drafts: [
						{
							id: "compound-1",
							draft: {
								canvas_config: { width: 1080, height: 1920 },
								duration: 100_900_000,
								fps: 30,
							},
						},
					],
				},
			},
		});

		expect(settings).toEqual({
			width: 3840,
			height: 2160,
			fps: 60,
			durationUs: 5_000_000,
		});
	});
});
