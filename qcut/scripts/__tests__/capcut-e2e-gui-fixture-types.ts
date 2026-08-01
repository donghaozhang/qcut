import type { CapCutGuiBundleVerifier } from "../capcut-e2e/gui-regression-bundle-verification.js";
import type { CapCutGuiAppInspector } from "../capcut-e2e/gui-regression-app-profile.js";
import type {
	CapCutGuiAssetIntegrity,
	CapCutGuiCaseId,
} from "../capcut-e2e/gui-regression-contract.js";

export interface FixtureBundle {
	bundleDirectory: string;
	caseId: CapCutGuiCaseId;
	completeMarkerPath: string;
	content: { bytes: number; sha256: string };
	contentText: string;
	copiedAssets: CapCutGuiAssetIntegrity[];
	draftDirectory: string;
	draftDirectories: string[];
	draftFiles: { bytes: number; relativePath: string; sha256: string }[];
	draftId: string;
	draftName: string;
	draftFolderName: string;
	generatedAssets: CapCutGuiAssetIntegrity[];
	ids: {
		draftId: string;
		placeholderId: string;
		projectId: string;
		timelineId: string;
	};
	migrationManifestPath: string;
	timelineMaterialsSize: number;
}

export interface GuiFixture {
	appPath: string;
	bundleManifestPath: string;
	bundles: FixtureBundle[];
	canonicalHomePath: string;
	canonicalStorePath: string;
	dedicatedTestHomeDirectory: string;
	inspectApp: CapCutGuiAppInspector;
	rootMetaInfoPath: string;
	runId: string;
	verifyBundle: CapCutGuiBundleVerifier;
}
