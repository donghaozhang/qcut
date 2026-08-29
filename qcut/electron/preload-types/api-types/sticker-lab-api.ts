export type LocalStickerLabMimeType = "image/gif" | "image/png";
export type LocalStickerLabRuntimeResourceMimeType = "image/png" | "video/webm";
export type LocalStickerLabReadableMimeType =
	| LocalStickerLabMimeType
	| LocalStickerLabRuntimeResourceMimeType;

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

export interface LocalStickerLabRuntimeResourceAsset {
	kind: "local-reference-runtime-resource";
	rootPath: string;
	batchId: string;
	stickerId: string;
	resourceName: string;
	byteSize: number;
	checksumSha256: string;
}

export interface LocalStickerLabRuntimeResource {
	resourceName: string;
	fileName: string;
	mimeType: LocalStickerLabRuntimeResourceMimeType;
	asset: LocalStickerLabRuntimeResourceAsset;
}

export interface LocalStickerLabRuntimePackage {
	/** The renderer validates this untrusted IPC value before using it. */
	descriptor: unknown;
	resources: LocalStickerLabRuntimeResource[];
}

export interface LocalStickerLabReference {
	id: string;
	displayName: string;
	fileName: string;
	mimeType: LocalStickerLabMimeType;
	sourceKind: LocalStickerLabSourceKind;
	playback: LocalStickerLabPlayback;
	asset: LocalStickerLabAsset;
	runtimePackage?: LocalStickerLabRuntimePackage;
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
	mimeType: LocalStickerLabReadableMimeType;
	batchId: string;
	stickerId: string;
	checksumSha256: string;
	resourceName?: string;
}

export interface StickerLabRendererAPI {
	discoverLocalReferences(options: {
		rootPath?: string;
	}): Promise<LocalStickerLabDiscovery>;
	readLocalReference(options: {
		rootPath: string;
		batchId: string;
		stickerId: string;
		resourceName?: string;
	}): Promise<LocalStickerLabReadResult>;
}

/** Private local Sticker Lab references exposed through the secure preload. */
export interface StickerLabAPI {
	stickerLab?: StickerLabRendererAPI;
}
