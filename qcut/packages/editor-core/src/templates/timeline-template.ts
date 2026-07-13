import type { MediaFitMode, MediaType } from "../types/timeline.js";

export const TIMELINE_TEMPLATE_SCHEMA = "qcut.timeline-template" as const;
export const TIMELINE_TEMPLATE_SCHEMA_VERSION = 2 as const;

export const TEMPLATE_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;

export type TemplateAspectRatio = (typeof TEMPLATE_ASPECT_RATIOS)[number];

export interface TemplateFontDependency {
	family: string;
	fallback: string;
	required?: boolean;
}

interface TemplateSlotBase {
	id: string;
	label: string;
	required: boolean;
}

export interface TemplateMediaSlot extends TemplateSlotBase {
	kind: "media";
	acceptedTypes: MediaType[];
}

export interface TemplateTextSlot extends TemplateSlotBase {
	kind: "text";
	defaultValue: string;
}

export type TimelineTemplateSlot = TemplateMediaSlot | TemplateTextSlot;

interface TemplatePlacementBase {
	slotId: string;
	startTime: number;
	duration: number;
	trackName?: string;
}

export interface TemplateMediaPlacement extends TemplatePlacementBase {
	kind: "media";
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	scaleX?: number;
	scaleY?: number;
	fitMode?: MediaFitMode;
	animationInType?: "none" | "fade" | "zoom-in" | "slide-up";
	animationInDuration?: number;
}

export interface TemplateTextPlacement extends TemplatePlacementBase {
	kind: "text";
	stylePresetId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontFamily?: string;
	fontSize?: number;
	animationType?: "none" | "fade" | "slide-up" | "slide-left";
}

export type TimelineTemplatePlacement =
	| TemplateMediaPlacement
	| TemplateTextPlacement;

export interface TimelineTemplateVariant {
	aspectRatio: TemplateAspectRatio;
	canvas: { width: number; height: number };
	placements: TimelineTemplatePlacement[];
}

export interface TimelineTemplateVersionMigration {
	fromVersion: string;
	toVersion: string;
	slotAliases: Record<string, string>;
}

export interface TimelineTemplate {
	schema: typeof TIMELINE_TEMPLATE_SCHEMA;
	schemaVersion: typeof TIMELINE_TEMPLATE_SCHEMA_VERSION;
	id: string;
	version: string;
	name: string;
	description: string;
	defaultAspectRatio: TemplateAspectRatio;
	supportedAspectRatios: TemplateAspectRatio[];
	fonts: TemplateFontDependency[];
	slots: TimelineTemplateSlot[];
	variants: TimelineTemplateVariant[];
	migrations?: TimelineTemplateVersionMigration[];
}

export interface LegacyTimelineTemplateV1 {
	schema: typeof TIMELINE_TEMPLATE_SCHEMA;
	schemaVersion: 1;
	id: string;
	version: string;
	name: string;
	description?: string;
	aspectRatio: TemplateAspectRatio;
	canvas: { width: number; height: number };
	fonts?: TemplateFontDependency[];
	mediaSlots?: Array<
		TemplateMediaSlot & Omit<TemplateMediaPlacement, "kind" | "slotId">
	>;
	textSlots?: Array<
		TemplateTextSlot & Omit<TemplateTextPlacement, "kind" | "slotId">
	>;
}

export type TimelineTemplateDocument =
	| TimelineTemplate
	| LegacyTimelineTemplateV1;

export type TimelineTemplateSlotValue =
	| { kind: "media"; mediaId: string }
	| { kind: "text"; text: string };

export type TimelineTemplateSlotValues = Record<
	string,
	TimelineTemplateSlotValue
>;

export interface TemplateInstanceBinding {
	instanceId: string;
	templateId: string;
	templateVersion: string;
	slotId: string;
	aspectRatio?: TemplateAspectRatio;
	instanceStartTime?: number;
}

export type TimelineTemplateValidationCode =
	| "invalid-identity"
	| "invalid-version"
	| "invalid-ratio"
	| "duplicate-slot"
	| "missing-variant"
	| "invalid-placement"
	| "unknown-slot"
	| "slot-kind-mismatch"
	| "invalid-font";

export interface TimelineTemplateValidationIssue {
	code: TimelineTemplateValidationCode;
	path: string;
	message: string;
}

export interface TimelineTemplateValidationResult {
	valid: boolean;
	issues: TimelineTemplateValidationIssue[];
}

function isAspectRatio(value: string): value is TemplateAspectRatio {
	return TEMPLATE_ASPECT_RATIOS.some((ratio) => ratio === value);
}

function hasText(value: string): boolean {
	return value.trim().length > 0;
}

function pushIssue({
	issues,
	code,
	path,
	message,
}: {
	issues: TimelineTemplateValidationIssue[];
	code: TimelineTemplateValidationCode;
	path: string;
	message: string;
}): void {
	issues.push({ code, path, message });
}

export function validateTimelineTemplate({
	template,
}: {
	template: TimelineTemplate;
}): TimelineTemplateValidationResult {
	const issues: TimelineTemplateValidationIssue[] = [];
	if (!hasText(template.id) || !hasText(template.name)) {
		pushIssue({
			issues,
			code: "invalid-identity",
			path: "id",
			message: "Template id and name are required",
		});
	}
	if (!/^\d+\.\d+\.\d+$/.test(template.version)) {
		pushIssue({
			issues,
			code: "invalid-version",
			path: "version",
			message: "Template version must use semantic versioning",
		});
	}
	if (
		!isAspectRatio(template.defaultAspectRatio) ||
		!template.supportedAspectRatios.includes(template.defaultAspectRatio)
	) {
		pushIssue({
			issues,
			code: "invalid-ratio",
			path: "defaultAspectRatio",
			message: "Default ratio must be included in supported ratios",
		});
	}

	const slotIds = new Set<string>();
	for (const [index, slot] of template.slots.entries()) {
		if (slotIds.has(slot.id)) {
			pushIssue({
				issues,
				code: "duplicate-slot",
				path: `slots.${index}.id`,
				message: `Duplicate slot id: ${slot.id}`,
			});
		}
		slotIds.add(slot.id);
	}

	const variantRatios = new Set(
		template.variants.map((variant) => variant.aspectRatio)
	);
	for (const ratio of template.supportedAspectRatios) {
		if (!variantRatios.has(ratio)) {
			pushIssue({
				issues,
				code: "missing-variant",
				path: `variants.${ratio}`,
				message: `Missing layout variant for ${ratio}`,
			});
		}
	}

	const slotsById = new Map(template.slots.map((slot) => [slot.id, slot]));
	for (const [variantIndex, variant] of template.variants.entries()) {
		if (
			!isAspectRatio(variant.aspectRatio) ||
			variant.canvas.width <= 0 ||
			variant.canvas.height <= 0
		) {
			pushIssue({
				issues,
				code: "invalid-ratio",
				path: `variants.${variantIndex}`,
				message: "Variant ratio and canvas dimensions must be valid",
			});
		}
		for (const [placementIndex, placement] of variant.placements.entries()) {
			const path = `variants.${variantIndex}.placements.${placementIndex}`;
			if (
				placement.startTime < 0 ||
				placement.duration <= 0 ||
				!Number.isFinite(placement.startTime) ||
				!Number.isFinite(placement.duration)
			) {
				pushIssue({
					issues,
					code: "invalid-placement",
					path,
					message: "Placement timing must be finite and positive",
				});
			}
			const slot = slotsById.get(placement.slotId);
			if (!slot) {
				pushIssue({
					issues,
					code: "unknown-slot",
					path: `${path}.slotId`,
					message: `Unknown slot: ${placement.slotId}`,
				});
				continue;
			}
			if (slot.kind !== placement.kind) {
				pushIssue({
					issues,
					code: "slot-kind-mismatch",
					path,
					message: `Placement kind does not match slot ${slot.id}`,
				});
			}
		}
	}

	for (const [index, font] of template.fonts.entries()) {
		if (!hasText(font.family) || !hasText(font.fallback)) {
			pushIssue({
				issues,
				code: "invalid-font",
				path: `fonts.${index}`,
				message: "Font family and fallback are required",
			});
		}
	}

	return { valid: issues.length === 0, issues };
}

export function migrateTimelineTemplate({
	document,
}: {
	document: TimelineTemplateDocument;
}): TimelineTemplate {
	if (document.schema !== TIMELINE_TEMPLATE_SCHEMA) {
		throw new Error("Unsupported timeline template schema");
	}
	if (document.schemaVersion === TIMELINE_TEMPLATE_SCHEMA_VERSION) {
		return document;
	}
	if (document.schemaVersion !== 1) {
		throw new Error("Unsupported template schema version");
	}

	const mediaSlots = document.mediaSlots ?? [];
	const textSlots = document.textSlots ?? [];
	return {
		schema: TIMELINE_TEMPLATE_SCHEMA,
		schemaVersion: TIMELINE_TEMPLATE_SCHEMA_VERSION,
		id: document.id,
		version: document.version,
		name: document.name,
		description: document.description ?? "",
		defaultAspectRatio: document.aspectRatio,
		supportedAspectRatios: [document.aspectRatio],
		fonts: document.fonts ?? [],
		slots: [
			...mediaSlots.map(({ startTime, duration, trackName, ...slot }) => slot),
			...textSlots.map(
				({
					startTime,
					duration,
					trackName,
					stylePresetId,
					x,
					y,
					width,
					height,
					fontFamily,
					fontSize,
					animationType,
					...slot
				}) => slot
			),
		],
		variants: [
			{
				aspectRatio: document.aspectRatio,
				canvas: document.canvas,
				placements: [
					...mediaSlots.map(
						({ id, label, required, acceptedTypes, ...placement }) => ({
							...placement,
							kind: "media" as const,
							slotId: id,
						})
					),
					...textSlots.map(
						({ id, label, required, defaultValue, ...placement }) => ({
							...placement,
							kind: "text" as const,
							slotId: id,
						})
					),
				],
			},
		],
	};
}

export function resolveTimelineTemplateVariant({
	template,
	aspectRatio,
}: {
	template: TimelineTemplate;
	aspectRatio?: TemplateAspectRatio;
}): TimelineTemplateVariant {
	const ratio = aspectRatio ?? template.defaultAspectRatio;
	const variant = template.variants.find(
		(candidate) => candidate.aspectRatio === ratio
	);
	if (!variant) {
		throw new Error(`Template ${template.id} does not support ${ratio}`);
	}
	return variant;
}

export function validateTemplateSlotValues({
	template,
	values,
}: {
	template: TimelineTemplate;
	values: TimelineTemplateSlotValues;
}): string[] {
	const errors: string[] = [];
	for (const slot of template.slots) {
		const value = values[slot.id];
		if (!value) {
			if (slot.required) errors.push(`${slot.label} is required`);
			continue;
		}
		if (value.kind !== slot.kind) {
			errors.push(`${slot.label} has the wrong value type`);
			continue;
		}
		if (value.kind === "media" && !hasText(value.mediaId)) {
			errors.push(`${slot.label} is required`);
		}
		if (value.kind === "text" && !hasText(value.text) && slot.required) {
			errors.push(`${slot.label} is required`);
		}
	}
	return errors;
}

export function resolveTemplateFontDependencies({
	template,
	availableFonts,
}: {
	template: TimelineTemplate;
	availableFonts: readonly string[];
}): {
	resolvedFamilies: Record<string, string>;
	missingRequired: string[];
} {
	const available = new Set(availableFonts.map((font) => font.toLowerCase()));
	const resolvedFamilies: Record<string, string> = {};
	const missingRequired: string[] = [];
	for (const font of template.fonts) {
		const present = available.has(font.family.toLowerCase());
		resolvedFamilies[font.family] = present ? font.family : font.fallback;
		if (!present && font.required) missingRequired.push(font.family);
	}
	return { resolvedFamilies, missingRequired };
}

export function migrateTemplateSlotValues({
	template,
	fromVersion,
	values,
}: {
	template: TimelineTemplate;
	fromVersion: string;
	values: TimelineTemplateSlotValues;
}): TimelineTemplateSlotValues {
	if (fromVersion === template.version) return { ...values };
	let version = fromVersion;
	let migrated = { ...values };
	const visited = new Set<string>();
	while (version !== template.version) {
		if (visited.has(version)) {
			throw new Error(`Template migration cycle at ${version}`);
		}
		visited.add(version);
		const migration = template.migrations?.find(
			(candidate) => candidate.fromVersion === version
		);
		if (!migration) {
			throw new Error(
				`No migration path for ${template.id} from ${version} to ${template.version}`
			);
		}
		const nextValues: TimelineTemplateSlotValues = {};
		for (const [slotId, value] of Object.entries(migrated)) {
			nextValues[migration.slotAliases[slotId] ?? slotId] = value;
		}
		migrated = nextValues;
		version = migration.toVersion;
	}
	return migrated;
}
