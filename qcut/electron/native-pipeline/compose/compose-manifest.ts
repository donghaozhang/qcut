import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const filterSchema = z.object({
	resourceId: z
		.string()
		.trim()
		.regex(/^\d{1,30}$/),
	intensity: z.number().min(0).max(100).default(100),
});

const trimSchema = z
	.object({
		in: z.number().min(0).default(0),
		out: z.number().positive().optional(),
	})
	.superRefine((trim, context) => {
		if (trim.out !== undefined && trim.out <= trim.in) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "trim.out must be greater than trim.in",
			});
		}
	});

const clipSchema = z.object({
	id: z.string().trim().min(1).max(80),
	source: z.string().trim().min(1),
	trim: trimSchema.default({ in: 0 }),
	filters: z.array(filterSchema).max(16).default([]),
});

const transitionSchema = z.object({
	between: z.tuple([
		z.string().trim().min(1).max(80),
		z.string().trim().min(1).max(80),
	]),
	preset: z.literal("crossfade").default("crossfade"),
	duration: z.number().positive().max(5).default(0.5),
});

const overlaySchema = z.object({
	type: z.literal("sticker"),
	source: z.string().trim().min(1),
	start: z.number().min(0),
	duration: z.number().positive().max(120),
	transform: z
		.object({
			x: z.number().min(-1).max(1).default(0),
			y: z.number().min(-1).max(1).default(0),
			scale: z.number().positive().max(2).default(0.2),
			rotation: z.number().min(-360).max(360).default(0),
		})
		.default({ x: 0, y: 0, scale: 0.2, rotation: 0 }),
	opacity: z.number().min(0).max(1).default(1),
	fadeIn: z.number().min(0).max(5).default(0),
	fadeOut: z.number().min(0).max(5).default(0),
});

const audioSchema = z.object({
	type: z.literal("sound-effect"),
	source: z.string().trim().min(1),
	start: z.number().min(0),
	trim: trimSchema.default({ in: 0 }),
	volume: z.number().min(0).max(4).default(1),
	fadeIn: z.number().min(0).max(5).default(0),
	fadeOut: z.number().min(0).max(5).default(0),
});

const composeManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		canvas: z
			.object({
				width: z.number().int().positive().max(4096).default(1280),
				height: z.number().int().positive().max(4096).default(720),
				fps: z.number().int().positive().max(60).default(30),
			})
			.default({ width: 1280, height: 720, fps: 30 }),
		clips: z.array(clipSchema).min(1).max(8),
		transitions: z.array(transitionSchema).max(7).default([]),
		overlays: z.array(overlaySchema).max(50).default([]),
		audio: z.array(audioSchema).max(50).default([]),
	})
	.superRefine((manifest, context) => {
		const ids = new Set<string>();
		for (const [index, clip] of manifest.clips.entries()) {
			if (ids.has(clip.id)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Duplicate clip id: ${clip.id}`,
					path: ["clips", index, "id"],
				});
			}
			ids.add(clip.id);
		}
		for (const [index, overlay] of manifest.overlays.entries()) {
			if (overlay.fadeIn + overlay.fadeOut > overlay.duration) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					message: "fadeIn + fadeOut cannot exceed overlay duration",
					path: ["overlays", index],
				});
			}
		}
	});

export type ComposeManifest = z.infer<typeof composeManifestSchema>;
export type ComposeClip = ComposeManifest["clips"][number];
export type ComposeTransition = ComposeManifest["transitions"][number];
export type ComposeOverlay = ComposeManifest["overlays"][number];
export type ComposeAudio = ComposeManifest["audio"][number];

export interface LoadedComposeManifest {
	configPath: string;
	configDirectory: string;
	manifest: ComposeManifest;
}

export function parseComposeManifest({
	value,
}: {
	value: unknown;
}): ComposeManifest {
	return composeManifestSchema.parse(value);
}

export async function loadComposeManifest({
	configPath,
}: {
	configPath: string;
}): Promise<LoadedComposeManifest> {
	const absoluteConfigPath = resolve(configPath);
	const contents = await readFile(absoluteConfigPath, "utf8");
	return {
		configPath: absoluteConfigPath,
		configDirectory: dirname(absoluteConfigPath),
		manifest: parseComposeManifest({ value: JSON.parse(contents) }),
	};
}
