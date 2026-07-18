import type {
	AssetManifestEntry,
	EffectOverlayRenderStage,
	EffectRenderProgram,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { resolveEffectOverlayAsset } from "@/lib/effects/effect-overlay-resources";
import type { EffectOverlaySourceInput } from "../types";
import { isSvgContent, rasterizeSvgToPng } from "./svg-rasterizer";

type LogFn = (...args: unknown[]) => void;

interface EffectOverlayExportAPI {
	saveStickerForExport: (params: {
		sessionId: string;
		stickerId: string;
		imageData: Uint8Array;
		format: string;
	}) => Promise<{ success: boolean; path?: string; error?: string }>;
}

interface OverlayStageReference {
	elementId: string;
	stageIndex: number;
	stage: EffectOverlayRenderStage;
}

interface MaterializedOverlayResource {
	path: string;
	animated: boolean;
}

type EnsureSourceResource = ({
	asset,
}: {
	asset: AssetManifestEntry;
}) => Promise<ResolvedAssetResource[]>;

function collectOverlayStageReferences({
	programsByElementId,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
}): OverlayStageReference[] {
	const references: OverlayStageReference[] = [];
	for (const [elementId, program] of programsByElementId) {
		for (const [stageIndex, stage] of program.stages.entries()) {
			if (stage.kind !== "overlay") continue;
			references.push({ elementId, stageIndex, stage });
		}
	}
	return references;
}

function isAnimatedAsset({ asset }: { asset: AssetManifestEntry }): boolean {
	const metadata = asset.metadata;
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"animated" in metadata &&
		metadata.animated === true
	);
}

function safeExportResourceId({ resourceId }: { resourceId: string }): string {
	return `effect-${resourceId.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function imageFormat({ blob, sourceUrl }: { blob: Blob; sourceUrl: string }) {
	const mimeSubtype = blob.type.split("/")[1]?.toLowerCase();
	if (mimeSubtype === "jpeg") return "jpg";
	if (mimeSubtype && mimeSubtype !== "octet-stream") return mimeSubtype;
	const extension = sourceUrl.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
	return extension === "jpeg" ? "jpg" : extension || "png";
}

async function materializeOverlayResource({
	api,
	asset,
	canvasHeight,
	canvasWidth,
	ensureSourceResource,
	logger,
	sessionId,
}: {
	api: EffectOverlayExportAPI;
	asset: AssetManifestEntry;
	canvasHeight: number;
	canvasWidth: number;
	ensureSourceResource: EnsureSourceResource;
	logger: LogFn;
	sessionId: string;
}): Promise<MaterializedOverlayResource> {
	const resources = await ensureSourceResource({ asset });
	const source = resources.find((resource) => resource.role === "source");
	if (!source?.blob) {
		throw new Error(
			`Effect overlay resource has no exportable bytes: ${asset.id}`
		);
	}

	const svg = isSvgContent(source.blob, source.sourceUrl);
	const imageData = svg
		? await rasterizeSvgToPng(source.blob, canvasWidth, canvasHeight)
		: new Uint8Array(await source.blob.arrayBuffer());
	const format = svg
		? "png"
		: imageFormat({ blob: source.blob, sourceUrl: source.sourceUrl });
	const result = await api.saveStickerForExport({
		sessionId,
		stickerId: safeExportResourceId({ resourceId: asset.id }),
		imageData,
		format,
	});
	if (!result.success) {
		throw new Error(
			result.error || `Failed to save effect overlay: ${asset.id}`
		);
	}
	if (!result.path) {
		throw new Error(`Effect overlay saved without a path: ${asset.id}`);
	}
	logger(`[EffectOverlaySources] Materialized ${asset.id}: ${result.path}`);
	return { path: result.path, animated: isAnimatedAsset({ asset }) };
}

/** Resolves every overlay render stage through the shared asset cache for FFmpeg. */
export async function extractEffectOverlaySources({
	programsByElementId,
	sessionId,
	canvasWidth,
	canvasHeight,
	api = platform().ffmpeg as unknown as EffectOverlayExportAPI,
	ensureSourceResource = ({ asset }) =>
		ensureAssetResources({
			asset,
			roles: ["source"],
			cacheBundledResources: true,
		}),
	logger = console.log,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	sessionId: string;
	canvasWidth: number;
	canvasHeight: number;
	api?: EffectOverlayExportAPI;
	ensureSourceResource?: EnsureSourceResource;
	logger?: LogFn;
}): Promise<ReadonlyMap<string, EffectOverlaySourceInput[]>> {
	const references = collectOverlayStageReferences({ programsByElementId });
	if (references.length === 0) return new Map();
	if (!api?.saveStickerForExport) {
		throw new Error("Effect overlay export API is unavailable");
	}

	const materializedByResourceId = new Map<
		string,
		Promise<MaterializedOverlayResource>
	>();
	const resolveMaterialized = ({ resourceId }: { resourceId: string }) => {
		const existing = materializedByResourceId.get(resourceId);
		if (existing) return existing;
		const asset = resolveEffectOverlayAsset({ resourceId });
		const pending = materializeOverlayResource({
			api,
			asset,
			canvasHeight,
			canvasWidth,
			ensureSourceResource,
			logger,
			sessionId,
		});
		materializedByResourceId.set(resourceId, pending);
		return pending;
	};

	const resolved = await Promise.all(
		references.map(async (reference) => ({
			...reference,
			...(await resolveMaterialized({
				resourceId: reference.stage.resourceId,
			})),
		}))
	);
	const sourcesByElementId = new Map<string, EffectOverlaySourceInput[]>();
	for (const reference of resolved) {
		const sources = sourcesByElementId.get(reference.elementId) ?? [];
		sources.push({
			resourceId: reference.stage.resourceId,
			stageIndex: reference.stageIndex,
			path: reference.path,
			animated: reference.animated,
		});
		sourcesByElementId.set(reference.elementId, sources);
	}
	return sourcesByElementId;
}
