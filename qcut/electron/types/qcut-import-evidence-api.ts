export const QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA =
	"qcut.draft-interop.persisted-import-evidence" as const;

export interface QCutPersistedImportEvidenceRequest {
	expectedBundleDigest: string;
	projectId: string;
}

export interface QCutPersistedImportEvidenceMedia {
	byteLength: number;
	id: string;
	sha256: string;
	type: "audio" | "image" | "video";
}

export interface QCutPersistedImportEvidenceSnapshot {
	binding: {
		bundleDigest: string;
		importId: string;
		profileId: string;
	};
	capture: {
		appVersion: string;
		capturedAtIso: string;
		readPasses: 2;
		source: "qcut-renderer-persisted-storage";
	};
	media: QCutPersistedImportEvidenceMedia[];
	project: {
		fps: number;
		height: number;
		id: string;
		name: string;
		sceneId: string;
		width: number;
	};
	schema: typeof QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA;
	schemaVersion: 1;
	tracks: unknown[];
}

export interface QCutPersistedImportEvidenceRendererRequest {
	appVersion: string;
	request: QCutPersistedImportEvidenceRequest;
	requestId: string;
}

export interface QCutPersistedImportEvidenceRendererResponse {
	error?: string;
	requestId: string;
	result?: QCutPersistedImportEvidenceSnapshot;
}
