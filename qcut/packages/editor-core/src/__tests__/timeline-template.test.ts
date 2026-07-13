import { describe, expect, it } from "vitest";
import {
	TIMELINE_TEMPLATE_SCHEMA,
	migrateTemplateSlotValues,
	migrateTimelineTemplate,
	resolveTemplateFontDependencies,
	resolveTimelineTemplateVariant,
	validateTemplateSlotValues,
	validateTimelineTemplate,
	type LegacyTimelineTemplateV1,
	type TimelineTemplate,
} from "../templates/index.js";

function createTemplate(): TimelineTemplate {
	return {
		schema: TIMELINE_TEMPLATE_SCHEMA,
		schemaVersion: 2,
		id: "creator-opener",
		version: "2.0.0",
		name: "Creator opener",
		description: "Portrait and landscape opener",
		defaultAspectRatio: "16:9",
		supportedAspectRatios: ["16:9", "9:16"],
		fonts: [
			{ family: "Inter", fallback: "Arial", required: true },
			{ family: "Accent", fallback: "Georgia" },
		],
		slots: [
			{
				id: "hero",
				kind: "media",
				label: "Hero video",
				required: true,
				acceptedTypes: ["video", "image"],
			},
			{
				id: "headline",
				kind: "text",
				label: "Headline",
				required: true,
				defaultValue: "Watch this",
			},
		],
		variants: [
			{
				aspectRatio: "16:9",
				canvas: { width: 1920, height: 1080 },
				placements: [
					{
						kind: "media",
						slotId: "hero",
						startTime: 0,
						duration: 5,
						fitMode: "cover",
					},
					{
						kind: "text",
						slotId: "headline",
						startTime: 0.25,
						duration: 3,
						stylePresetId: "yellow-pop",
						x: 0,
						y: 26,
						width: 900,
						height: 220,
					},
				],
			},
			{
				aspectRatio: "9:16",
				canvas: { width: 1080, height: 1920 },
				placements: [
					{
						kind: "media",
						slotId: "hero",
						startTime: 0,
						duration: 5,
						fitMode: "cover",
					},
					{
						kind: "text",
						slotId: "headline",
						startTime: 0.25,
						duration: 3,
						stylePresetId: "yellow-pop",
						x: 0,
						y: 32,
						width: 760,
						height: 220,
					},
				],
			},
		],
		migrations: [
			{
				fromVersion: "1.0.0",
				toVersion: "1.5.0",
				slotAliases: { title: "heading" },
			},
			{
				fromVersion: "1.5.0",
				toVersion: "2.0.0",
				slotAliases: { heading: "headline" },
			},
		],
	};
}

describe("timeline template protocol", () => {
	it("validates a complete multi-ratio template", () => {
		expect(validateTimelineTemplate({ template: createTemplate() })).toEqual({
			valid: true,
			issues: [],
		});
	});

	it("reports duplicate slots and incompatible placements", () => {
		const template = createTemplate();
		template.slots.push({ ...template.slots[0] });
		template.variants[0].placements.push({
			kind: "text",
			slotId: "hero",
			startTime: -1,
			duration: 0,
			stylePresetId: "default",
			x: 0,
			y: 0,
			width: 100,
			height: 100,
		});

		const codes = validateTimelineTemplate({ template }).issues.map(
			(issue) => issue.code
		);
		expect(codes).toContain("duplicate-slot");
		expect(codes).toContain("invalid-placement");
		expect(codes).toContain("slot-kind-mismatch");
	});

	it("migrates a v1 document into a v2 variant", () => {
		const legacy: LegacyTimelineTemplateV1 = {
			schema: TIMELINE_TEMPLATE_SCHEMA,
			schemaVersion: 1,
			id: "legacy",
			version: "1.0.0",
			name: "Legacy",
			aspectRatio: "1:1",
			canvas: { width: 1080, height: 1080 },
			mediaSlots: [
				{
					id: "hero",
					kind: "media",
					label: "Hero",
					required: true,
					acceptedTypes: ["video"],
					startTime: 0,
					duration: 4,
				},
			],
			textSlots: [
				{
					id: "title",
					kind: "text",
					label: "Title",
					required: true,
					defaultValue: "Hello",
					startTime: 0,
					duration: 2,
					stylePresetId: "default",
					x: 0,
					y: 0,
					width: 640,
					height: 180,
				},
			],
		};

		const migrated = migrateTimelineTemplate({ document: legacy });
		expect(migrated.schemaVersion).toBe(2);
		expect(migrated.slots.map((slot) => slot.id)).toEqual(["hero", "title"]);
		expect(migrated.variants[0].placements).toHaveLength(2);
	});

	it("resolves ratio variants and rejects unsupported ratios", () => {
		const template = createTemplate();
		expect(
			resolveTimelineTemplateVariant({ template, aspectRatio: "9:16" }).canvas
		).toEqual({ width: 1080, height: 1920 });
		expect(() =>
			resolveTimelineTemplateVariant({ template, aspectRatio: "1:1" })
		).toThrow("does not support 1:1");
	});

	it("validates required slot values", () => {
		const template = createTemplate();
		expect(
			validateTemplateSlotValues({
				template,
				values: { headline: { kind: "text", text: "" } },
			})
		).toEqual(["Hero video is required", "Headline is required"]);
	});

	it("resolves font fallbacks and reports required dependencies", () => {
		const result = resolveTemplateFontDependencies({
			template: createTemplate(),
			availableFonts: ["Accent"],
		});
		expect(result.resolvedFamilies).toEqual({
			Inter: "Arial",
			Accent: "Accent",
		});
		expect(result.missingRequired).toEqual(["Inter"]);
	});

	it("migrates slot values through a version chain", () => {
		const result = migrateTemplateSlotValues({
			template: createTemplate(),
			fromVersion: "1.0.0",
			values: { title: { kind: "text", text: "Migrated" } },
		});
		expect(result).toEqual({
			headline: { kind: "text", text: "Migrated" },
		});
	});

	it("fails closed when a migration path is missing", () => {
		expect(() =>
			migrateTemplateSlotValues({
				template: createTemplate(),
				fromVersion: "0.9.0",
				values: {},
			})
		).toThrow("No migration path");
	});
});
