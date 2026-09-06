import { z } from "zod";
import type {
	CoverCachedEntry,
	CoverCatalog,
} from "./jianying-cover-contract.js";
import type { JianyingFontLabFontSummary } from "./jianying-font-lab-contract.js";
import type { JianyingTextRuntimeReference } from "./jianying-text-runtime-contract.js";
import {
	coverDependencyReferences,
	identifyCoverDependency,
} from "./jianying-cover-dependencies.js";

const color = z.string().regex(/^(#[a-f\d]{6})?$/i);
const finite = z.number().finite();
const textSchema = z.object({
	id: z.string().min(1),
	content: z.string().min(1).max(2000),
	font_path: z.string().regex(/^text\/([a-f\d]{32})?$/),
	font_title: z.string().max(200),
	font_size: finite.positive(),
	alignment: z.union([z.literal(0), z.literal(1), z.literal(2)]),
	typesetting: z.literal(0),
	text_alpha: finite.min(0).max(1),
	text_color: color,
	use_effect_default_color: z.boolean().optional(),
	bold_width: finite.nonnegative(),
	italic_degree: finite,
	underline: z.boolean(),
	border_color: color,
	border_width: finite.nonnegative(),
	background_color: color,
	background_alpha: finite.min(0).max(1),
	has_shadow: z.boolean(),
	shadow_color: color,
	shadow_alpha: finite.min(0).max(1),
	shadow_smoothing: finite.nonnegative(),
	shadow_point: z.object({ x: finite, y: finite }),
	letter_spacing: finite,
	line_spacing: finite,
	shape_clip_x: z.literal(false),
	shape_clip_y: z.literal(false),
	ktv_color: z.literal("").optional(),
	sub_type: z.literal(0).optional(),
	style_name: z.string().max(200).optional(),
});
const segmentSchema = z.object({
	id: z.string().min(1),
	material_id: z.string().min(1),
	render_index: finite,
	extra_material_refs: z.array(z.string()).max(32),
	keyframe_refs: z.array(z.never()),
	common_keyframes: z.array(z.never()).optional(),
	mirror: z.literal(false).optional(),
	reverse: z.literal(false).optional(),
	clip: z.object({
		alpha: finite.min(0).max(1),
		rotation: finite.min(-180).max(180),
		flip: z.object({
			horizontal: z.literal(false),
			vertical: z.literal(false),
		}),
		scale: z
			.object({ x: finite.positive(), y: finite.positive() })
			.refine((v) => Math.abs(v.x - v.y) < 1e-6),
		transform: z.object({ x: finite.min(-1).max(1), y: finite.min(-1).max(1) }),
	}),
});
const record = z.record(z.string(), z.unknown());
const templateSchema = z.object({
	canvas_config: z.object({
		width: finite.int().min(2).max(8192),
		height: finite.int().min(2).max(8192),
	}),
	cover: z.object({
		cover_draft: z.object({
			materials: record,
			tracks: z.array(
				z.object({ type: z.string(), segments: z.array(record) })
			),
		}),
	}),
});
const effectSchema = z.object({
	id: z.string(),
	type: z.literal("text_effect"),
	path: z.string().min(1),
	resource_id: z.string().regex(/^\d{1,32}$/),
	name: z.string(),
});
export type CoverLayoutText = {
	text: z.infer<typeof textSchema>;
	segment: z.infer<typeof segmentSchema>;
	effect?: z.infer<typeof effectSchema>;
};
export interface CoverTextLayout {
	packageHash: string;
	canvas: { width: number; height: number };
	texts: CoverLayoutText[];
	fonts: Record<string, JianyingFontLabFontSummary>;
	wordArt: Record<string, JianyingTextRuntimeReference>;
}

export function resolveCoverLayoutFontDependency({
	text,
	entry,
	catalog,
}: {
	text: CoverLayoutText["text"];
	entry: CoverCachedEntry;
	catalog: CoverCatalog;
}) {
	const dependencies =
		text.font_path === "text/" && text.font_title === "系统"
			? catalog.entries
					.flatMap((value) => value.dependencies)
					.filter(
						(value) =>
							value.resolution?.method === "builtin" &&
							value.resolution.label === "SystemFont/zh-hans.ttf"
					)
			: entry.dependencies.filter(
					(value) => value.reference === text.font_path
				);
	const unique = new Map(
		dependencies.map((value) => [
			value.files
				.map((file) => file.sha256)
				.sort()
				.join(":"),
			value,
		])
	);
	if (unique.size !== 1)
		throw new Error(`Cover font is missing or ambiguous: ${text.font_title}`);
	const dependency = [...unique.values()][0];
	if (
		dependency.status !== "cached" ||
		dependency.files.filter((file) => /\.(ttf|otf)$/i.test(file.logicalPath))
			.length !== 1
	)
		throw new Error(`Cover font package is incomplete: ${text.font_title}`);
	return dependency;
}

export function parseCoverTextLayout({ definition }: { definition: unknown }) {
	const template = templateSchema.parse(definition);
	const { materials, tracks } = template.cover.cover_draft;
	const materialTexts = z.array(record).parse(materials.texts);
	const effects = z.array(record).parse(materials.effects ?? []);
	const ids = new Set<string>();
	const texts = tracks
		.filter((t) => t.type !== "video" && t.type !== "audio")
		.flatMap((track) => {
			if (!["sticker", "text"].includes(track.type))
				throw new Error("Unsupported cover track");
			return track.segments.map((value) => {
				const segment = segmentSchema.parse(value);
				if (ids.has(segment.id)) throw new Error("Duplicate cover segment");
				ids.add(segment.id);
				const matches = materialTexts.filter(
					(t) => t.id === segment.material_id
				);
				if (matches.length !== 1)
					throw new Error("Cover text material is missing or ambiguous");
				if (matches[0].typesetting !== 0)
					throw new Error("Vertical cover text is not supported yet");
				const text = textSchema.parse(matches[0]);
				if (segment.extra_material_refs.length > 1)
					throw new Error("Multiple cover text effects are not supported");
				const effectId = segment.extra_material_refs[0];
				const matchesEffect = effects.filter((e) => e.id === effectId);
				if (effectId && matchesEffect.length !== 1)
					throw new Error("Cover text effect is missing or ambiguous");
				const effect = effectId
					? effectSchema.parse(matchesEffect[0])
					: undefined;
				return { text, segment, ...(effect ? { effect } : {}) };
			});
		});
	if (!texts.length || texts.length > 20)
		throw new Error("Cover requires 1 to 20 text layers");
	texts.sort((a, b) => a.segment.render_index - b.segment.render_index);
	return { canvas: template.canvas_config, texts };
}

export function describeCoverDependencies({
	entry,
	definition,
}: {
	entry: CoverCachedEntry;
	definition: unknown;
}) {
	const template = templateSchema.parse(definition);
	const { materials, tracks } = template.cover.cover_draft;
	const materialRows = Object.entries(materials).flatMap(([kind, values]) =>
		Array.isArray(values)
			? values.map((value) => ({ kind, value: record.parse(value) }))
			: []
	);
	return entry.dependencies.map((dependency) => {
		const owners = materialRows.filter(({ kind, value }) =>
			coverDependencyReferences({ materials: { [kind]: [value] } }).includes(
				dependency.reference
			)
		);
		const uses = tracks.flatMap((track) =>
			track.segments.flatMap((segment) => {
				const refs = [
					segment.material_id,
					...(Array.isArray(segment.extra_material_refs)
						? segment.extra_material_refs
						: []),
				];
				return owners.some(
					({ value }) => typeof value.id === "string" && refs.includes(value.id)
				)
					? [
							track.type === "video"
								? "background"
								: track.type === "text" || track.type === "sticker"
									? "text"
									: "unknown",
						]
					: [];
			})
		);
		const identity = identifyCoverDependency({
			reference: dependency.reference,
			materials,
		});
		const role =
			uses.length && uses.every((use) => use === "background")
				? "background"
				: uses.length && uses.every((use) => use === "text")
					? "text"
					: "unknown";
		return {
			...dependency,
			usage: {
				role,
				name:
					identity?.name ||
					dependency.resolution?.label ||
					dependency.reference,
				kind: identity?.kind ?? "unknown",
				resourceId: identity?.resourceId,
			} satisfies NonNullable<
				CoverCachedEntry["dependencies"][number]["usage"]
			>,
		};
	});
}
