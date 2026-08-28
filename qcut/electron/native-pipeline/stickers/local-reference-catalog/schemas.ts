import { z } from "zod";
import { MAX_LOCAL_REFERENCE_ASSET_BYTES } from "./filesystem.js";
import { localStickerMediaTimeToTicks } from "./media-time.js";

const RESOURCE_ID_PATTERN = /^\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const URL_SCHEME_PATTERN = /(?:https?|s3|gs|file):\/\//i;
const URL_FIELD_PATTERN = /(?:^|[_-])(?:url|uri)(?:$|[_-])/i;
const RUNTIME_RESOURCE_PREFIX = "$resource:";
const RUNTIME_PRIMARY_SOURCE = "$primary";

const sourceKindSchema = z.enum([
	"static-image",
	"atlas-animation",
	"png-sequence",
	"direct-gif",
	"preview-gif",
	"alpha-video",
	"composite",
	"engine-effect",
]);

const staticPlaybackSchema = z.object({ kind: z.literal("static") }).strict();
const animatedPlaybackSchema = z
	.object({
		kind: z.literal("animated"),
		frameCount: z.number().int().min(2),
		frameRate: z.number().positive().optional(),
		cycleDuration: z.number().positive(),
		loop: z.boolean(),
	})
	.strict();

const playbackSchema = z.discriminatedUnion("kind", [
	staticPlaybackSchema,
	animatedPlaybackSchema,
]);

const fileNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(180)
	.refine((fileName) => !/[\\/]/.test(fileName), {
		message: "fileName must not contain path separators",
	});

const runtimeResourceNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(300)
	.refine((resourceName) => !resourceName.startsWith("/"), {
		message: "resourceName must be relative",
	})
	.refine((resourceName) => !resourceName.includes("\\"), {
		message: "resourceName must use forward slashes",
	})
	.refine(
		(resourceName) =>
			!resourceName
				.split("/")
				.some((segment) => segment === "." || segment === ".."),
		{ message: "resourceName must not contain dot segments" }
	)
	.refine((resourceName) => !resourceName.startsWith("$"), {
		message: "resourceName must not use a reserved runtime source",
	});

const runtimeResourceMimeTypeSchema = z.enum(["image/png", "video/webm"]);

const runtimeRepeatSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("infinite") }).strict(),
	z
		.object({
			kind: z.literal("finite"),
			additionalIterations: z
				.number()
				.int()
				.safe()
				.nonnegative()
				.max(Number.MAX_SAFE_INTEGER - 1),
		})
		.strict(),
]);
const runtimeCompletionSchema = z.enum(["freeze-last", "hide"]);
const positivePixelSizeSchema = z
	.object({
		width: z.number().int().safe().positive(),
		height: z.number().int().safe().positive(),
	})
	.strict();
const pixelRectSchema = z
	.object({
		x: z.number().int().safe().nonnegative(),
		y: z.number().int().safe().nonnegative(),
		width: z.number().int().safe().positive(),
		height: z.number().int().safe().positive(),
	})
	.strict();
const frameTimingShape = {
	startSeconds: z.number().nonnegative().finite(),
	durationSeconds: z.number().positive().finite(),
} as const;
const atlasFrameSchema = z
	.object({
		...frameTimingShape,
		id: z.string().trim().min(1).max(300),
		frameRect: pixelRectSchema,
		rotated: z.boolean(),
		trimmed: z.boolean(),
		spriteSourceRect: pixelRectSchema,
		sourceSize: positivePixelSizeSchema,
	})
	.strict();
const atlasRuntimeDescriptorSchema = z
	.object({
		kind: z.literal("atlas-animation"),
		atlasSource: z.string().trim().min(1).max(300).optional(),
		atlasSize: positivePixelSizeSchema.optional(),
		cycleDurationSeconds: z.number().positive().finite(),
		frames: z.array(atlasFrameSchema).min(1).max(10_000),
		repeat: runtimeRepeatSchema,
		completion: runtimeCompletionSchema,
	})
	.strict();
const pngSequenceRuntimeDescriptorSchema = z
	.object({
		kind: z.literal("png-sequence"),
		cycleDurationSeconds: z.number().positive().finite(),
		frames: z
			.array(
				z
					.object({
						...frameTimingShape,
						source: z.string().trim().min(1).max(300),
					})
					.strict()
			)
			.min(1)
			.max(10_000),
		repeat: runtimeRepeatSchema,
		completion: runtimeCompletionSchema,
	})
	.strict();
const normalizedRectSchema = z
	.object({
		x: z.number().min(0).max(1).finite(),
		y: z.number().min(0).max(1).finite(),
		width: z.number().positive().max(1).finite(),
		height: z.number().positive().max(1).finite(),
	})
	.strict()
	.refine((rect) => rect.x + rect.width <= 1 && rect.y + rect.height <= 1, {
		message: "normalized rectangle must fit inside the source",
	});
const alphaMaskSchema = z
	.object({
		channel: z.enum(["alpha", "luma"]),
		inverted: z.boolean(),
	})
	.strict();
const alphaLayoutSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("embedded-alpha") }).strict(),
	z
		.object({
			kind: z.literal("side-by-side"),
			colorRect: normalizedRectSchema,
			maskRect: normalizedRectSchema,
			mask: alphaMaskSchema,
		})
		.strict(),
	z
		.object({
			kind: z.literal("separate-mask"),
			maskSource: z.string().trim().min(1).max(300),
			mask: alphaMaskSchema,
		})
		.strict(),
]);
const alphaVideoRuntimeDescriptorSchema = z
	.object({
		kind: z.literal("alpha-video"),
		source: z.string().trim().min(1).max(300),
		sourceDurationSeconds: z.number().positive().finite(),
		cycleDurationSeconds: z.number().positive().finite(),
		layout: alphaLayoutSchema,
		progressKeyframes: z
			.array(
				z
					.object({
						atSeconds: z.number().nonnegative().finite(),
						sourceProgress: z.number().min(0).max(1).finite(),
						interpolation: z.enum(["hold", "linear"]),
					})
					.strict()
			)
			.min(2)
			.max(10_000),
		repeat: runtimeRepeatSchema,
		completion: runtimeCompletionSchema,
	})
	.strict();

function validateFrameTiming({
	context,
	cycleDurationSeconds,
	frames,
}: {
	context: z.RefinementCtx;
	cycleDurationSeconds: number;
	frames: readonly { startSeconds: number; durationSeconds: number }[];
}): void {
	let expectedStartTicks = 0n;
	for (const [index, frame] of frames.entries()) {
		const frameStartTicks = localStickerMediaTimeToTicks({
			seconds: frame.startSeconds,
		});
		const frameDurationTicks = localStickerMediaTimeToTicks({
			seconds: frame.durationSeconds,
		});
		if (frameStartTicks !== expectedStartTicks || frameDurationTicks <= 0n) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["frames", index, "startSeconds"],
				message: "runtime frames must be contiguous and start at zero",
			});
		}
		expectedStartTicks += frameDurationTicks;
	}
	if (
		localStickerMediaTimeToTicks({ seconds: cycleDurationSeconds }) !==
		expectedStartTicks
	) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["cycleDurationSeconds"],
			message: "runtime frame durations must equal the cycle duration",
		});
	}
}

function pixelRectFits({
	container,
	rect,
}: {
	container: { height: number; width: number };
	rect: { height: number; width: number; x: number; y: number };
}): boolean {
	return (
		rect.width <= container.width &&
		rect.height <= container.height &&
		rect.x <= container.width - rect.width &&
		rect.y <= container.height - rect.height
	);
}

function normalizedRectsOverlap({
	left,
	right,
}: {
	left: { height: number; width: number; x: number; y: number };
	right: { height: number; width: number; x: number; y: number };
}): boolean {
	return (
		left.x < right.x + right.width &&
		left.x + left.width > right.x &&
		left.y < right.y + right.height &&
		left.y + left.height > right.y
	);
}

const runtimeDescriptorSchema = z
	.discriminatedUnion("kind", [
		atlasRuntimeDescriptorSchema,
		pngSequenceRuntimeDescriptorSchema,
		alphaVideoRuntimeDescriptorSchema,
	])
	.superRefine((descriptor, context) => {
		if (descriptor.kind === "atlas-animation") {
			validateFrameTiming({
				context,
				cycleDurationSeconds: descriptor.cycleDurationSeconds,
				frames: descriptor.frames,
			});
			const ids = descriptor.frames.map(({ id }) => id);
			if (new Set(ids).size !== ids.length) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["frames"],
					message: "atlas frame ids must be unique",
				});
			}
			for (const [index, frame] of descriptor.frames.entries()) {
				if (
					descriptor.atlasSize &&
					!pixelRectFits({
						container: descriptor.atlasSize,
						rect: frame.frameRect,
					})
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["frames", index, "frameRect"],
						message: "atlas frame lies outside the atlas image",
					});
				}
				if (
					!pixelRectFits({
						container: frame.sourceSize,
						rect: frame.spriteSourceRect,
					})
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["frames", index, "spriteSourceRect"],
						message: "atlas trim rectangle lies outside its source size",
					});
				}
				const expectedStoredWidth = frame.rotated
					? frame.spriteSourceRect.height
					: frame.spriteSourceRect.width;
				const expectedStoredHeight = frame.rotated
					? frame.spriteSourceRect.width
					: frame.spriteSourceRect.height;
				if (
					frame.frameRect.width !== expectedStoredWidth ||
					frame.frameRect.height !== expectedStoredHeight
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["frames", index, "frameRect"],
						message:
							"atlas stored dimensions do not match rotation and trim geometry",
					});
				}
				if (
					!frame.trimmed &&
					(frame.spriteSourceRect.x !== 0 ||
						frame.spriteSourceRect.y !== 0 ||
						frame.spriteSourceRect.width !== frame.sourceSize.width ||
						frame.spriteSourceRect.height !== frame.sourceSize.height)
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["frames", index, "trimmed"],
						message: "untrimmed atlas frame must cover its full source size",
					});
				}
			}
			return;
		}
		if (descriptor.kind === "png-sequence") {
			validateFrameTiming({
				context,
				cycleDurationSeconds: descriptor.cycleDurationSeconds,
				frames: descriptor.frames,
			});
			return;
		}
		if (
			descriptor.layout.kind === "side-by-side" &&
			normalizedRectsOverlap({
				left: descriptor.layout.colorRect,
				right: descriptor.layout.maskRect,
			})
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["layout"],
				message: "side-by-side color and mask rectangles cannot overlap",
			});
		}
		const keyframes = descriptor.progressKeyframes;
		const lastKeyframe = keyframes[keyframes.length - 1];
		if (
			localStickerMediaTimeToTicks({
				seconds: keyframes[0]?.atSeconds ?? -1,
			}) !== 0n ||
			localStickerMediaTimeToTicks({
				seconds: lastKeyframe?.atSeconds ?? -1,
			}) !==
				localStickerMediaTimeToTicks({
					seconds: descriptor.cycleDurationSeconds,
				})
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["progressKeyframes"],
				message:
					"alpha-video keyframes must start at zero and end at the cycle duration",
			});
		}
		for (let index = 1; index < keyframes.length; index += 1) {
			const currentTicks = localStickerMediaTimeToTicks({
				seconds: keyframes[index]?.atSeconds ?? 0,
			});
			const previousTicks = localStickerMediaTimeToTicks({
				seconds: keyframes[index - 1]?.atSeconds ?? 0,
			});
			if (currentTicks > previousTicks) {
				continue;
			}
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["progressKeyframes", index, "atSeconds"],
				message: "alpha-video keyframes must be strictly ordered",
			});
		}
	});

type StickerRuntimeDescriptor = z.infer<typeof runtimeDescriptorSchema>;

const localRuntimeResourceSchema = z
	.object({
		resourceName: runtimeResourceNameSchema,
		fileName: fileNameSchema,
		filePath: z.string().min(1),
		mimeType: runtimeResourceMimeTypeSchema,
	})
	.strict();

const localRuntimePackageSchema = z
	.object({
		descriptor: runtimeDescriptorSchema,
		resources: z.array(localRuntimeResourceSchema).max(100),
	})
	.strict();

function descriptorSourceRequirements({
	descriptor,
}: {
	descriptor: StickerRuntimeDescriptor;
}): Array<{ expectedMimePrefix: "image/" | "video/"; source: string }> {
	switch (descriptor.kind) {
		case "atlas-animation":
			return [
				{
					expectedMimePrefix: "image/",
					source: descriptor.atlasSource ?? RUNTIME_PRIMARY_SOURCE,
				},
			];
		case "png-sequence":
			return descriptor.frames.map(({ source }) => ({
				expectedMimePrefix: "image/" as const,
				source,
			}));
		case "alpha-video":
			return [
				{ expectedMimePrefix: "video/", source: descriptor.source },
				...(descriptor.layout.kind === "separate-mask"
					? [
							{
								expectedMimePrefix: "video/" as const,
								source: descriptor.layout.maskSource,
							},
						]
					: []),
			];
	}
}

function validateRuntimePackage({
	context,
	fileName,
	mimeType,
	runtimePackage,
	sourceKind,
}: {
	context: z.RefinementCtx;
	fileName: string;
	mimeType: "image/gif" | "image/png";
	runtimePackage: z.infer<typeof localRuntimePackageSchema>;
	sourceKind: z.infer<typeof sourceKindSchema>;
}): void {
	if (runtimePackage.descriptor.kind !== sourceKind) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["runtimePackage", "descriptor", "kind"],
			message: "runtime descriptor kind must match sourceKind",
		});
	}
	const resourceByName = new Map<
		string,
		(typeof runtimePackage.resources)[number]
	>();
	for (const [index, resource] of runtimePackage.resources.entries()) {
		if (resource.resourceName === fileName) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["runtimePackage", "resources", index, "resourceName"],
				message: "runtime resource name conflicts with the primary file",
			});
		}
		if (resourceByName.has(resource.resourceName)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["runtimePackage", "resources", index, "resourceName"],
				message: "runtime resource names must be unique",
			});
			continue;
		}
		resourceByName.set(resource.resourceName, resource);
	}

	const referencedResources = new Set<string>();
	const requirements = descriptorSourceRequirements({
		descriptor: runtimePackage.descriptor,
	});
	for (const requirement of requirements) {
		if (requirement.source.startsWith(RUNTIME_RESOURCE_PREFIX)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["runtimePackage", "descriptor"],
				message:
					"local manifests must use ordinary resource names before registration",
			});
			continue;
		}
		if (
			requirement.source === RUNTIME_PRIMARY_SOURCE ||
			requirement.source === fileName
		) {
			if (!mimeType.startsWith(requirement.expectedMimePrefix)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["runtimePackage", "descriptor"],
					message: `runtime primary source requires ${requirement.expectedMimePrefix}`,
				});
			}
			continue;
		}
		const resource = resourceByName.get(requirement.source);
		if (!resource) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["runtimePackage", "descriptor"],
				message: `runtime source is missing: ${requirement.source}`,
			});
			continue;
		}
		referencedResources.add(resource.resourceName);
		if (!resource.mimeType.startsWith(requirement.expectedMimePrefix)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["runtimePackage", "descriptor"],
				message: `runtime source ${requirement.source} requires ${requirement.expectedMimePrefix}`,
			});
		}
	}
	for (const [index, resource] of runtimePackage.resources.entries()) {
		if (referencedResources.has(resource.resourceName)) continue;
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["runtimePackage", "resources", index],
			message: "runtime resource is not referenced by the descriptor",
		});
	}
}

const localItemSchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		displayName: z.string().trim().min(1).max(120),
		fileName: fileNameSchema,
		filePath: z.string().min(1),
		mimeType: z.enum(["image/gif", "image/png"]),
		sourceKind: sourceKindSchema,
		playback: playbackSchema,
		runtimePackage: localRuntimePackageSchema.optional(),
	})
	.strict()
	.superRefine((item, context) => {
		if (!item.runtimePackage) return;
		validateRuntimePackage({
			context,
			fileName: item.fileName,
			mimeType: item.mimeType,
			runtimePackage: item.runtimePackage,
			sourceKind: item.sourceKind,
		});
	});

const localCategorySchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		label: z.string().trim().min(1).max(80),
		sourcePanel: z.string().trim().min(1).max(160),
		items: z.array(localItemSchema).min(1).max(100),
	})
	.strict();

const localManifestSchema = z
	.object({
		version: z.literal(1),
		referenceOnly: z.literal(true).optional(),
		generatedAt: z.string().min(1).optional(),
		categories: z.array(localCategorySchema).min(1).max(100),
	})
	.strict();

const reportRuntimeResourceSchema = z
	.object({
		resourceName: runtimeResourceNameSchema,
		fileName: fileNameSchema,
		filePath: z.string().min(1),
		mimeType: runtimeResourceMimeTypeSchema,
		codec: z.enum(["png", "vp8", "vp9"]),
		width: z.number().int().positive(),
		height: z.number().int().positive(),
		frameCount: z.number().int().positive(),
		frameRate: z.number().positive().nullable(),
		durationSeconds: z.number().positive().nullable(),
		byteSize: z.number().int().positive().max(MAX_LOCAL_REFERENCE_ASSET_BYTES),
		sha256: z.string().regex(SHA256_PATTERN),
	})
	.strict()
	.superRefine((resource, context) => {
		const isPng = resource.mimeType === "image/png";
		const hasPngMetadata =
			resource.codec === "png" &&
			resource.frameCount === 1 &&
			resource.frameRate === null &&
			resource.durationSeconds === null;
		const hasWebmMetadata =
			(resource.codec === "vp8" || resource.codec === "vp9") &&
			resource.frameRate !== null &&
			resource.durationSeconds !== null;
		if ((isPng && hasPngMetadata) || (!isPng && hasWebmMetadata)) return;
		context.addIssue({
			code: z.ZodIssueCode.custom,
			message: "runtime resource media metadata does not match its MIME type",
		});
	});

const reportSuccessFields = {
	categoryId: z.string().regex(RESOURCE_ID_PATTERN),
	category: z.string().trim().min(1).max(80),
	endpointRow: z.number().int().nonnegative().nullable(),
	position: z.number().int().nonnegative(),
	id: z.string().regex(RESOURCE_ID_PATTERN),
	title: z.string().trim().min(1).max(120),
	sourceKind: sourceKindSchema,
	mimeType: z.enum(["image/gif", "image/png"]),
	filePath: z.string().min(1),
	codec: z.enum(["gif", "png"]),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	frameCount: z.number().int().positive(),
	frameRate: z.number().positive().nullable(),
	durationSeconds: z.number().positive().nullable(),
	byteSize: z.number().int().positive().max(MAX_LOCAL_REFERENCE_ASSET_BYTES),
	sha256: z.string().regex(SHA256_PATTERN),
	runtimeResources: z.array(reportRuntimeResourceSchema).max(100).optional(),
};

const reportSuccessSchema = z.object(reportSuccessFields).strict();
const legacyReportSuccessSchema = z
	.object({
		...reportSuccessFields,
		nonEmpty: z.literal(true),
		reusedExistingFile: z.boolean(),
	})
	.strict();

const legacyReportSchema = z
	.object({
		version: z.literal(1),
		referenceOnly: z.literal(true).optional(),
		success: z.array(legacyReportSuccessSchema).min(1),
	})
	.passthrough();

const currentReportSchema = z
	.object({
		version: z.literal(2),
		referenceOnly: z.literal(true),
		success: z.array(reportSuccessSchema).min(1),
	})
	.passthrough();

const reportSchema = z.discriminatedUnion("version", [
	legacyReportSchema,
	currentReportSchema,
]);

export type LocalReferenceManifest = z.infer<typeof localManifestSchema>;
export type LocalReferenceManifestCategory = z.infer<
	typeof localCategorySchema
>;
export type LocalReferenceManifestItem = z.infer<typeof localItemSchema>;
export type LocalReferenceReport = z.infer<typeof reportSchema>;
export type LocalReferenceReportItem = z.infer<typeof reportSuccessSchema>;

function assertNoUrls({
	path = "root",
	value,
}: {
	path?: string;
	value: unknown;
}): void {
	if (typeof value === "string") {
		if (URL_SCHEME_PATTERN.test(value)) {
			throw new Error(`URL-bearing input is forbidden at ${path}`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertNoUrls({ path: `${path}.${index}`, value: item });
		}
		return;
	}
	if (typeof value !== "object" || value === null) return;
	for (const [key, item] of Object.entries(value)) {
		if (
			URL_FIELD_PATTERN.test(key) ||
			key.toLocaleLowerCase().endsWith("url")
		) {
			throw new Error(`URL field is forbidden at ${path}.${key}`);
		}
		assertNoUrls({ path: `${path}.${key}`, value: item });
	}
}

function formatSchemaError({ error }: { error: z.ZodError }): string {
	return error.issues
		.map(({ message, path }) => `${path.join(".") || "root"}: ${message}`)
		.join("; ");
}

export function parseLocalReferenceManifest({
	candidate,
}: {
	candidate: unknown;
}): LocalReferenceManifest {
	assertNoUrls({ value: candidate });
	const result = localManifestSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker manifest: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}

export function parseLocalReferenceReport({
	candidate,
}: {
	candidate: unknown;
}): LocalReferenceReport {
	assertNoUrls({ value: candidate });
	const result = reportSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker report: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}
