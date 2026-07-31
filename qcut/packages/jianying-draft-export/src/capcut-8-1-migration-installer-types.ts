export interface CapCut81TargetAppGuardContext {
	capCutAppPath: string;
	targetDraftStoreDirectory: string;
}

export interface InstallTrustedCapCut81MigrationBundleOptions {
	assertTargetAppClosed: (
		context: CapCut81TargetAppGuardContext
	) => Promise<void>;
	capCutAppPath: string;
	outputDirectory: string;
	targetDraftStoreDirectory: string;
}

export interface CapCut81MigrationInstallResult {
	contentMirrorPaths: readonly string[];
	draftDirectory: string;
	draftFolderName: string;
	draftId: string;
	installedContentSha256: string;
	rootMetaInfoBackupPath: string;
	rootMetaInfoPath: string;
	targetDraftStoreDirectory: string;
	timelineId: string;
}

export interface CapCut81MigrationManifestIds {
	draftId: string;
	placeholderId: string;
	projectId: string;
	timelineId: string;
}

export interface CapCut81MigrationManifestAsset {
	bytes: number;
	relativePath: string;
	sha256: string;
}

export interface CapCut81MigrationManifest {
	assets: CapCut81MigrationManifestAsset[];
	content: {
		activeMirrors: string[];
		backups: string[];
		bytes: number;
		sha256: string;
	};
	generatedAssets: CapCut81MigrationManifestAsset[];
	generator: "QCut";
	ids: CapCut81MigrationManifestIds;
	profile: "capcut-desktop-8.1-plaintext";
	scaffoldFiles: string[];
	schemaVersion: 1;
	storeDirectory: "com.lveditor.draft";
	timelineMaterialsSize: number;
}

export interface VerifiedCapCut81MigrationBundle {
	contentRelativePaths: readonly string[];
	contentText: string;
	draftDirectories: readonly string[];
	draftFiles: readonly {
		bytes: number;
		changedAtMilliseconds: number;
		changedAtNanoseconds: string;
		device: number;
		deviceIdentity: string;
		inode: number;
		inodeIdentity: string;
		modifiedAtMilliseconds: number;
		modifiedAtNanoseconds: string;
		relativePath: string;
		sha256: string;
	}[];
	draftFolderName: string;
	manifest: CapCut81MigrationManifest;
	outputDirectory: string;
	sourceDraftDirectory: string;
	sourceDraftStoreDirectory: string;
	sourceRootEntry: Record<string, unknown>;
	storedDraftDirectory: string;
	storedDraftStoreDirectory: string;
}
