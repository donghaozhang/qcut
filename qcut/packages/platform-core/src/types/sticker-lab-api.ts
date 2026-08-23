/**
 * Platform contract for private, local-only Sticker Lab references.
 *
 * The contract intentionally exposes verified identities and bytes, never the
 * source file path. Local Jianying artwork remains outside the repository and
 * is marked reference-only throughout the UI/CLI data flow.
 *
 * @module @qcut/platform-core/types/sticker-lab-api
 */

export type LocalStickerLabMimeType = "image/gif" | "image/png";

export type LocalStickerLabSourceKind =
	| "static-image"
	| "atlas-animation"
	| "png-sequence"
	| "direct-gif"
	| "preview-gif"
	| "alpha-video"
	| "composite"
	| "engine-effect";

export type LocalStickerLabPlayback =
	| { kind: "static" }
	| {
			kind: "animated";
			frameCount: number;
			frameRate?: number;
			cycleDuration: number;
			loop: boolean;
	  };

export interface LocalStickerLabAsset {
	kind: "local-reference";
	rootPath: string;
	batchId: string;
	stickerId: string;
	byteSize: number;
	checksumSha256: string;
}

export interface LocalStickerLabReference {
	id: string;
	displayName: string;
	fileName: string;
	mimeType: LocalStickerLabMimeType;
	sourceKind: LocalStickerLabSourceKind;
	playback: LocalStickerLabPlayback;
	asset: LocalStickerLabAsset;
}

export interface LocalStickerLabCategory {
	id: string;
	label: string;
	sourcePanel: string;
	items: LocalStickerLabReference[];
}

export interface LocalStickerLabCatalog {
	version: 1;
	batchId: string;
	referenceOnly: true;
	generatedAt?: string;
	categories: LocalStickerLabCategory[];
	itemCount: number;
	totalBytes: number;
}

export interface LocalStickerLabWarning {
	batchId?: string;
	message: string;
}

export interface LocalStickerLabDiscovery {
	rootPath: string;
	catalogs: LocalStickerLabCatalog[];
	warnings: LocalStickerLabWarning[];
	summary: {
		batchCount: number;
		categoryCount: number;
		itemCount: number;
		totalBytes: number;
	};
}

export interface LocalStickerLabReadResult {
	bytes: Uint8Array;
	fileName: string;
	mimeType: LocalStickerLabMimeType;
	batchId: string;
	stickerId: string;
	checksumSha256: string;
}

export interface PlatformStickerLabAPI {
	discoverLocalReferences(options: {
		rootPath?: string;
	}): Promise<LocalStickerLabDiscovery>;
	readLocalReference(options: {
		rootPath: string;
		batchId: string;
		stickerId: string;
	}): Promise<LocalStickerLabReadResult>;
}
