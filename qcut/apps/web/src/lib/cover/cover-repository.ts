import {
	assertCoverAsset,
	assertCoverDesign,
	assertProjectCover,
	type CoverAssetRefV1,
	type CoverDesignV1,
	type ProjectCoverBindingV1,
} from "@qcut/editor-core/cover";
import { coverBlobStore, type CoverBlobStore } from "./cover-blob-store";

export async function hashCoverBlob({ blob }: { blob: Blob }): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await blob.arrayBuffer()
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
}

export class CoverRepository {
	constructor(private readonly store: CoverBlobStore = coverBlobStore) {}

	async saveAsset({
		projectId,
		blob,
		width,
		height,
	}: {
		projectId: string;
		blob: Blob;
		width: number;
		height: number;
	}): Promise<CoverAssetRefV1> {
		if (blob.type !== "image/png" && blob.type !== "image/webp")
			throw new Error("Cover assets must be normalized PNG or WebP");
		const sha256 = await hashCoverBlob({ blob });
		const extension = blob.type === "image/png" ? "png" : "webp";
		const asset: CoverAssetRefV1 = {
			assetId: sha256,
			sha256,
			relativePath: `cover/objects/${sha256}.${extension}`,
			mimeType: blob.type,
			width,
			height,
			byteLength: blob.size,
		};
		assertCoverAsset({ asset });
		await this.store.write({
			projectId,
			relativePath: asset.relativePath,
			blob,
		});
		await this.readAsset({ projectId, asset });
		return asset;
	}

	async readAsset({
		projectId,
		asset,
	}: {
		projectId: string;
		asset: CoverAssetRefV1;
	}): Promise<Blob> {
		assertCoverAsset({ asset });
		const blob = await this.store.read({
			projectId,
			relativePath: asset.relativePath,
		});
		if (
			!blob ||
			blob.size !== asset.byteLength ||
			(await hashCoverBlob({ blob })) !== asset.sha256
		)
			throw new Error("Cover asset is missing or corrupt");
		return blob.slice(0, blob.size, asset.mimeType);
	}

	async saveRevision({
		projectId,
		design,
		render,
		thumbnail,
	}: {
		projectId: string;
		design: CoverDesignV1;
		render: Blob;
		thumbnail: Blob;
	}): Promise<ProjectCoverBindingV1> {
		assertCoverDesign({ design });
		await Promise.all(
			design.layers.map((layer) =>
				this.readAsset({ projectId, asset: layer.asset })
			)
		);
		const [renderAsset, thumbnailAsset] = await Promise.all([
			this.saveAsset({ projectId, blob: render, ...design.canvas }),
			this.saveAsset({ projectId, blob: thumbnail, width: 640, height: 360 }),
		]);
		const cover: ProjectCoverBindingV1 = {
			schemaVersion: 1,
			designId: design.id,
			designRevision: design.revision,
			designPath: `cover/designs/${design.id}/${design.revision}.json`,
			render: renderAsset,
			thumbnail: thumbnailAsset,
			source: design.source,
			canvas: { width: design.canvas.width, height: design.canvas.height },
			updatedAt: design.updatedAt,
		};
		assertProjectCover({ cover });
		const existing = await this.store.read({
			projectId,
			relativePath: cover.designPath,
		});
		const serialized = JSON.stringify(design);
		if (existing && (await existing.text()) !== serialized)
			throw new Error("Cover revision already exists");
		await this.store.write({
			projectId,
			relativePath: cover.designPath,
			blob: new Blob([serialized], { type: "application/json" }),
		});
		const readBack = await this.loadDesign({ projectId, cover });
		if (JSON.stringify(readBack) !== serialized)
			throw new Error("Cover design read-back mismatch");
		return cover;
	}

	async loadDesign({
		projectId,
		cover,
	}: {
		projectId: string;
		cover: ProjectCoverBindingV1;
	}): Promise<CoverDesignV1> {
		assertProjectCover({ cover });
		const blob = await this.store.read({
			projectId,
			relativePath: cover.designPath,
		});
		if (!blob) throw new Error("Cover design is missing");
		const design: CoverDesignV1 = JSON.parse(await blob.text());
		assertCoverDesign({ design });
		if (
			design.id !== cover.designId ||
			design.revision !== cover.designRevision ||
			design.canvas.width !== cover.canvas.width ||
			design.canvas.height !== cover.canvas.height
		)
			throw new Error("Cover design does not match its binding");
		return design;
	}

	async copyProject({
		sourceProjectId,
		targetProjectId,
		cover,
	}: {
		sourceProjectId: string;
		targetProjectId: string;
		cover: ProjectCoverBindingV1;
	}): Promise<void> {
		const design = await this.loadDesign({ projectId: sourceProjectId, cover });
		const assets = new Map(
			[
				...design.layers.map((layer) => layer.asset),
				cover.render,
				cover.thumbnail,
			].map((asset) => [asset.relativePath, asset])
		);
		await Promise.all(
			[...assets.values()].map(async (asset) => {
				const blob = await this.readAsset({
					projectId: sourceProjectId,
					asset,
				});
				await this.store.write({
					projectId: targetProjectId,
					relativePath: asset.relativePath,
					blob,
				});
				await this.readAsset({ projectId: targetProjectId, asset });
			})
		);
		await this.store.write({
			projectId: targetProjectId,
			relativePath: cover.designPath,
			blob: new Blob([JSON.stringify(design)], { type: "application/json" }),
		});
		await this.loadDesign({ projectId: targetProjectId, cover });
	}

	async removeProject({ projectId }: { projectId: string }): Promise<void> {
		await this.store.removeProject({ projectId });
	}
}

export const coverRepository = new CoverRepository();
