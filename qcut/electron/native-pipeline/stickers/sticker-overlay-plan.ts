import { z } from "zod";

const soundEffectSchema = z.object({
	source: z.string().trim().min(1),
	volume: z.number().min(0).max(1).default(0.18),
	trimStart: z.number().min(0).default(0),
	duration: z.number().positive().max(10).optional(),
});

const stickerOverlayItemSchema = z
	.object({
		id: z.string().trim().min(1).optional(),
		stickerId: z.string().trim().min(1).optional(),
		source: z.string().trim().min(1).optional(),
		startTime: z.number().min(0),
		duration: z.number().positive().max(30),
		x: z.number(),
		y: z.number(),
		width: z.number().int().positive().max(4096).default(240),
		height: z.number().int().positive().max(4096).optional(),
		rotation: z.number().min(-360).max(360).default(0),
		opacity: z.number().min(0).max(1).default(1),
		fadeIn: z.number().min(0).max(2).default(0.12),
		fadeOut: z.number().min(0).max(2).default(0.18),
		soundEffect: soundEffectSchema.optional(),
	})
	.superRefine((item, context) => {
		if (Boolean(item.stickerId) === Boolean(item.source)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide exactly one of stickerId or source",
			});
		}
		if (item.fadeIn + item.fadeOut > item.duration) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: "fadeIn + fadeOut cannot exceed sticker duration",
			});
		}
	});

const stickerOverlayPlanSchema = z.object({
	version: z.literal(1).default(1),
	stickers: z.array(stickerOverlayItemSchema).min(1).max(50),
});

export type StickerOverlayPlan = z.infer<typeof stickerOverlayPlanSchema>;
export type StickerOverlayItem = z.infer<typeof stickerOverlayItemSchema>;
export type StickerSoundEffect = z.infer<typeof soundEffectSchema>;

export function parseStickerOverlayPlan({
	value,
}: {
	value: unknown;
}): StickerOverlayPlan {
	return stickerOverlayPlanSchema.parse(value);
}
