import { z } from "zod";

export const JIANYING_COVER_CATEGORIES = [
	{ id: "default", zh: "默认", en: "Default" },
	{ id: "recommended", zh: "推荐", en: "Recommended" },
	{ id: "life", zh: "生活", en: "Life" },
	{ id: "games", zh: "游戏", en: "Games" },
	{ id: "knowledge", zh: "知识", en: "Knowledge" },
	{ id: "style", zh: "时尚", en: "Fashion" },
	{ id: "film", zh: "影视", en: "Film & TV" },
	{ id: "food", zh: "美食", en: "Food" },
] as const;

const categorySchema = z.enum([
	"recommended",
	"life",
	"games",
	"knowledge",
	"style",
	"film",
	"food",
]);
const hashSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const coverObservationSchema = z.object({
	packageHash: hashSchema,
	title: z.string().min(1).max(200),
	categories: z.array(categorySchema).min(1),
	previewHash: hashSchema,
	evidence: z.literal("native-ui-and-template-content"),
});
export const coverObservationsSchema = z.array(coverObservationSchema);
export type CoverObservation = z.infer<typeof coverObservationSchema>;

export const coverCachedFileSchema = z.object({
	path: z.string().regex(/^objects\/[a-f0-9]{64}$/),
	sha256: z.string().regex(/^[a-f0-9]{64}$/),
	bytes: z.number().int().nonnegative().max(200_000_000),
	logicalPath: z.string().min(1),
});
export const coverDependencyResolutionSchema = z.object({
	method: z.enum(["exact-package", "catalog-version", "builtin"]),
	source: z.enum(["text-lab", "filter-lab", "application-builtin"]),
	resourceId: z.string().optional(),
	catalogResourceId: z.string().optional(),
	packageHash: hashSchema.optional(),
	label: z.string().optional(),
});
export type CoverDependencyResolution = z.infer<
	typeof coverDependencyResolutionSchema
>;
export interface CoverDependencySource {
	root: string;
	relativePath: string;
	singleFile?: boolean;
	resolution: CoverDependencyResolution;
}
export type CoverDependencyResolver = (request: {
	reference: string;
	materials: Record<string, unknown>;
}) => Promise<{
	source?: CoverDependencySource;
	reason?: string;
}>;
export const coverCachedEntrySchema = coverObservationSchema.extend({
	definition: coverCachedFileSchema,
	preview: coverCachedFileSchema,
	dependencies: z.array(
		z.object({
			reference: z.string(),
			files: z.array(coverCachedFileSchema),
			status: z.enum(["cached", "missing", "builtin", "unsupported-path"]),
			resolution: coverDependencyResolutionSchema.optional(),
			reason: z.string().optional(),
		})
	),
	textCount: z.number().int().nonnegative(),
	cacheStatus: z.enum(["complete", "missing-dependencies"]),
	renderStatus: z.literal("native-renderer-required"),
});
export const coverCatalogSchema = z.object({
	schema: z.literal("qcut.private-jianying-cover"),
	version: z.literal(1),
	capturedAt: z.string(),
	coverage: z.literal("observed-downloaded-subset"),
	entries: z.array(coverCachedEntrySchema),
});
export type CoverCachedFile = z.infer<typeof coverCachedFileSchema>;
export type CoverCachedEntry = z.infer<typeof coverCachedEntrySchema>;
export type CoverCatalog = z.infer<typeof coverCatalogSchema>;
export type CoverLibraryResult = {
	entries: (CoverCachedEntry & { previewDataUrl: string })[];
	coverage: CoverCatalog["coverage"];
	capturedAt: string | null;
};
export interface JianyingCoverAPI {
	list: () => Promise<CoverLibraryResult>;
}
export const JIANYING_COVER_LIST_CHANNEL = "jianying-cover:list-private-cache";
