import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { EditorStateSnapshot } from "../../types/claude-state-api.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { ComposeAssetReference } from "./compose-protocol.js";

export async function discoverComposeGeneratedMedia({
	client,
	projectId,
}: {
	client: Pick<EditorApiClient, "get">;
	projectId: string;
}): Promise<ComposeAssetReference[]> {
	const snapshot = await client.get<EditorStateSnapshot>("/api/claude/state", {
		include: "media,project",
	});
	if (snapshot.state?.project?.activeProject?.id !== projectId)
		throw new Error("Compose generated media project changed.");
	const items = snapshot.state.media?.items ?? [];
	const candidates = await Promise.all(
		items.map(async (item): Promise<ComposeAssetReference | null> => {
			if (
				item.type === "audio" ||
				!item.metadata?.generatedAt ||
				item.ephemeral ||
				item.unsaved ||
				!item.localPath ||
				!isAbsolute(item.localPath)
			)
				return null;
			const info = await stat(item.localPath).catch(() => null);
			if (!info?.isFile() || info.size === 0) return null;
			return {
				provider: "local",
				assetType: "generated-media",
				assetId: `project-media:${item.id}:${info.size}:${info.mtimeMs}`,
				displayName: item.name,
				tags: [
					item.type,
					typeof item.metadata.model === "string"
						? item.metadata.model
						: "generated",
				],
				...(item.duration && item.duration > 0
					? { duration: item.duration }
					: {}),
				availability: "ready",
				license: "unknown",
				capabilities: {
					preview: true,
					editorApply: true,
					editorExport: true,
					headlessRender: true,
				},
				localPath: item.localPath,
				provenance: {
					projectId,
					mediaId: item.id,
					size: info.size,
					modifiedAt: info.mtimeMs,
					mediaKind: item.type,
				},
			};
		})
	);
	return candidates.filter(
		(asset): asset is ComposeAssetReference => asset !== null
	);
}

export async function resolveComposeGeneratedMedia({
	reference,
	client,
	projectId,
}: {
	reference: ComposeAssetReference;
	client: Pick<EditorApiClient, "get">;
	projectId: string;
}): Promise<ComposeAssetReference> {
	const assets = await discoverComposeGeneratedMedia({ client, projectId });
	const resolved = assets.find(
		(asset) =>
			asset.provider === reference.provider &&
			asset.assetId === reference.assetId
	);
	if (!resolved)
		throw new Error(
			`Generated media is not saved in this project: ${reference.assetId}`
		);
	return resolved;
}
