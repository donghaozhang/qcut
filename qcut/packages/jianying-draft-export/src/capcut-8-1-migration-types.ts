export interface BuildCapCut81MigrationScaffoldOptions {
	canvasHeight: number;
	createdAtMicroseconds: number;
	draftFolderName: string;
	draftId: string;
	draftName: string;
	durationMicroseconds: number;
	finalBundleRootPath: string;
	projectId: string;
	timelineId: string;
	timelineMaterialsSize: number;
	updatedAtMicroseconds: number;
}

export type CapCut81MigrationScaffold = ReadonlyMap<string, string>;
