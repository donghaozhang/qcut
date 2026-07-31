import { posix, win32 } from "node:path";
import type {
	BuildCapCut81MigrationScaffoldOptions,
	CapCut81MigrationScaffold,
} from "./capcut-8-1-migration-types.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f]/;
const FORBIDDEN_IDENTITY_FIELDS = new Set<string>([
	"device_id",
	"hard_disk_id",
	"mac_address",
	"os_version",
]);

export function compareCapCut81SidecarPaths({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function assertUuid({ label, value }: { label: string; value: string }): void {
	if (!UUID_PATTERN.test(value)) {
		throw new Error(`${label} must be a UUID.`);
	}
}

function assertNonNegativeSafeInteger({
	label,
	value,
}: {
	label: string;
	value: number;
}): void {
	if (!(Number.isSafeInteger(value) && value >= 0)) {
		throw new Error(`${label} must be a non-negative safe integer.`);
	}
}

function assertCanvasHeight({ canvasHeight }: { canvasHeight: number }): void {
	if (
		!(
			Number.isSafeInteger(canvasHeight) &&
			canvasHeight > 0 &&
			canvasHeight <= 16_384
		)
	) {
		throw new Error("canvasHeight must be an integer between 1 and 16384.");
	}
}

function assertDraftFolderName({
	draftFolderName,
}: {
	draftFolderName: string;
}): void {
	const isSafe =
		draftFolderName.length > 0 &&
		draftFolderName.length <= 64 &&
		draftFolderName.trim() === draftFolderName &&
		draftFolderName !== "." &&
		draftFolderName !== ".." &&
		posix.basename(draftFolderName) === draftFolderName &&
		!UNSAFE_PATH_SEGMENT_PATTERN.test(draftFolderName);
	if (!isSafe) {
		throw new Error("draftFolderName must be one safe path segment.");
	}
}

function assertDraftName({ draftName }: { draftName: string }): void {
	const isSafe =
		draftName.length > 0 &&
		draftName.length <= 128 &&
		draftName.trim() === draftName &&
		!CONTROL_CHARACTER_PATTERN.test(draftName);
	if (!isSafe) {
		throw new Error("draftName must be a non-empty single-line name.");
	}
}

export function getCapCut81AbsolutePathApi({
	finalBundleRootPath,
}: {
	finalBundleRootPath: string;
}): typeof posix {
	const pathApi = posix.isAbsolute(finalBundleRootPath)
		? posix
		: win32.isAbsolute(finalBundleRootPath)
			? win32
			: undefined;
	const isSafe =
		pathApi !== undefined &&
		pathApi.parse(finalBundleRootPath).root !== finalBundleRootPath &&
		pathApi.normalize(finalBundleRootPath) === finalBundleRootPath &&
		(pathApi === posix
			? !finalBundleRootPath.includes("\\")
			: !finalBundleRootPath.includes("/")) &&
		!finalBundleRootPath.includes("\0");
	if (!isSafe) {
		throw new Error(
			"finalBundleRootPath must be one normalized absolute path convention."
		);
	}
	return pathApi;
}

export function validateCapCut81MigrationOptions({
	canvasHeight,
	createdAtMicroseconds,
	draftFolderName,
	draftId,
	draftName,
	durationMicroseconds,
	finalBundleRootPath,
	projectId,
	timelineId,
	timelineMaterialsSize,
	updatedAtMicroseconds,
}: BuildCapCut81MigrationScaffoldOptions): void {
	assertCanvasHeight({ canvasHeight });
	assertNonNegativeSafeInteger({
		label: "createdAtMicroseconds",
		value: createdAtMicroseconds,
	});
	assertNonNegativeSafeInteger({
		label: "durationMicroseconds",
		value: durationMicroseconds,
	});
	assertNonNegativeSafeInteger({
		label: "timelineMaterialsSize",
		value: timelineMaterialsSize,
	});
	assertNonNegativeSafeInteger({
		label: "updatedAtMicroseconds",
		value: updatedAtMicroseconds,
	});
	if (updatedAtMicroseconds < createdAtMicroseconds) {
		throw new Error(
			"updatedAtMicroseconds must not precede createdAtMicroseconds."
		);
	}
	assertDraftFolderName({ draftFolderName });
	assertDraftName({ draftName });
	getCapCut81AbsolutePathApi({ finalBundleRootPath });
	assertUuid({ label: "draftId", value: draftId });
	assertUuid({ label: "projectId", value: projectId });
	assertUuid({ label: "timelineId", value: timelineId });
	if (new Set([draftId, projectId, timelineId]).size !== 3) {
		throw new Error("draftId, projectId, and timelineId must be distinct.");
	}
}

function buildExpectedRelativePaths({
	draftFolderName,
	timelineId,
}: {
	draftFolderName: string;
	timelineId: string;
}): string[] {
	const timelineDirectory = `${draftFolderName}/Timelines/${timelineId}`;
	return [
		"root_meta_info.json",
		`${draftFolderName}/attachment_editing.json`,
		`${draftFolderName}/attachment_pc_common.json`,
		`${draftFolderName}/common_attachment/attachment_action_scene.json`,
		`${draftFolderName}/common_attachment/attachment_gen_ai_info.json`,
		`${draftFolderName}/common_attachment/attachment_pc_timeline.json`,
		`${draftFolderName}/common_attachment/attachment_script_video.json`,
		`${draftFolderName}/draft_agency_config.json`,
		`${draftFolderName}/draft_biz_config.json`,
		`${draftFolderName}/draft_meta_info.json`,
		`${draftFolderName}/draft_settings`,
		`${draftFolderName}/performance_opt_info.json`,
		`${draftFolderName}/timeline_layout.json`,
		`${draftFolderName}/Timelines/project.json`,
		`${draftFolderName}/Timelines/project.json.bak`,
		`${timelineDirectory}/attachment_editing.json`,
		`${timelineDirectory}/attachment_pc_common.json`,
		`${timelineDirectory}/common_attachment/attachment_action_scene.json`,
		`${timelineDirectory}/common_attachment/attachment_gen_ai_info.json`,
		`${timelineDirectory}/common_attachment/attachment_pc_timeline.json`,
		`${timelineDirectory}/common_attachment/attachment_script_video.json`,
	].sort((left, right) => compareCapCut81SidecarPaths({ left, right }));
}

function assertSafeRelativeSidecarPath({
	relativePath,
}: {
	relativePath: string;
}): void {
	const normalized = posix.normalize(relativePath);
	const isSafe =
		relativePath.length > 0 &&
		!posix.isAbsolute(relativePath) &&
		normalized === relativePath &&
		!relativePath.includes("\\") &&
		!relativePath.split("/").includes("..");
	if (!isSafe) {
		throw new Error(`Unsafe scaffold sidecar path: ${relativePath}.`);
	}
}

function getRecord({ value }: { value: unknown }): Record<string, unknown> {
	if (!(typeof value === "object" && value !== null && !Array.isArray(value))) {
		throw new Error("Expected a JSON object in generated scaffold.");
	}
	return value as Record<string, unknown>;
}

function parseJsonRecord({
	files,
	relativePath,
}: {
	files: ReadonlyMap<string, string>;
	relativePath: string;
}): Record<string, unknown> {
	const text = files.get(relativePath);
	if (text === undefined) {
		throw new Error(`Generated scaffold is missing ${relativePath}.`);
	}
	return getRecord({ value: JSON.parse(text) });
}

function assertNoIdentityFields({ value }: { value: unknown }): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			assertNoIdentityFields({ value: item });
		}
		return;
	}
	if (!(typeof value === "object" && value !== null)) return;
	for (const [key, child] of Object.entries(value)) {
		if (FORBIDDEN_IDENTITY_FIELDS.has(key)) {
			throw new Error(`Generated scaffold contains identity field ${key}.`);
		}
		assertNoIdentityFields({ value: child });
	}
}

function assertPathInsideRoot({
	candidatePath,
	rootPath,
}: {
	candidatePath: string;
	rootPath: string;
}): void {
	const pathApi = getCapCut81AbsolutePathApi({
		finalBundleRootPath: rootPath,
	});
	const relativePath = pathApi.relative(rootPath, candidatePath);
	const isInside =
		relativePath.length > 0 &&
		!pathApi.isAbsolute(relativePath) &&
		relativePath !== ".." &&
		!relativePath.startsWith(`..${pathApi.sep}`);
	if (!isInside) {
		throw new Error(
			`Generated path escapes finalBundleRootPath: ${candidatePath}.`
		);
	}
}

export function validateCapCut81MigrationScaffold({
	files,
	options,
}: {
	files: CapCut81MigrationScaffold;
	options: BuildCapCut81MigrationScaffoldOptions;
}): void {
	validateCapCut81MigrationOptions(options);
	const expectedPaths = buildExpectedRelativePaths({
		draftFolderName: options.draftFolderName,
		timelineId: options.timelineId,
	});
	const actualPaths = [...files.keys()];
	for (const relativePath of actualPaths) {
		assertSafeRelativeSidecarPath({ relativePath });
	}
	if (
		actualPaths.length !== expectedPaths.length ||
		actualPaths.some(
			(relativePath, index) => relativePath !== expectedPaths[index]
		)
	) {
		throw new Error(
			"Generated scaffold sidecar set does not match the profile."
		);
	}

	for (const [relativePath, text] of files) {
		const fileName = posix.basename(relativePath);
		if (fileName === "draft_biz_config.json") {
			if (text !== "") {
				throw new Error("draft_biz_config.json must be empty.");
			}
			continue;
		}
		if (fileName === "draft_settings") continue;
		assertNoIdentityFields({ value: JSON.parse(text) });
	}

	const pathApi = getCapCut81AbsolutePathApi({
		finalBundleRootPath: options.finalBundleRootPath,
	});
	const draftDirectoryPath = pathApi.join(
		options.finalBundleRootPath,
		options.draftFolderName
	);
	const rootMetaInfo = parseJsonRecord({
		files,
		relativePath: "root_meta_info.json",
	});
	if (rootMetaInfo.root_path !== options.finalBundleRootPath) {
		throw new Error("root_meta_info.json root_path is inconsistent.");
	}
	if (rootMetaInfo.draft_ids !== 1) {
		throw new Error("root_meta_info.json draft_ids must be 1.");
	}
	const entries = rootMetaInfo.all_draft_store;
	if (!(Array.isArray(entries) && entries.length === 1)) {
		throw new Error("root_meta_info.json must contain exactly one draft.");
	}
	const rootEntry = getRecord({ value: entries[0] });
	const expectedDraftInfoPath = pathApi.join(
		draftDirectoryPath,
		"draft_info.json"
	);
	const expectedCoverPath = pathApi.join(draftDirectoryPath, "draft_cover.jpg");
	if (
		rootEntry.draft_id !== options.draftId ||
		rootEntry.draft_name !== options.draftName ||
		rootEntry.draft_fold_path !== draftDirectoryPath ||
		rootEntry.draft_root_path !== options.finalBundleRootPath ||
		rootEntry.draft_json_file !== expectedDraftInfoPath ||
		rootEntry.draft_cover !== expectedCoverPath ||
		rootEntry.draft_timeline_materials_size !== options.timelineMaterialsSize
	) {
		throw new Error(
			"root_meta_info.json draft entry references are inconsistent."
		);
	}
	assertPathInsideRoot({
		candidatePath: rootEntry.draft_fold_path as string,
		rootPath: options.finalBundleRootPath,
	});
	assertPathInsideRoot({
		candidatePath: rootEntry.draft_json_file as string,
		rootPath: options.finalBundleRootPath,
	});
	assertPathInsideRoot({
		candidatePath: rootEntry.draft_cover as string,
		rootPath: options.finalBundleRootPath,
	});

	const draftMetaInfo = parseJsonRecord({
		files,
		relativePath: `${options.draftFolderName}/draft_meta_info.json`,
	});
	if (
		draftMetaInfo.draft_id !== options.draftId ||
		draftMetaInfo.draft_name !== options.draftName ||
		draftMetaInfo.draft_fold_path !== draftDirectoryPath ||
		draftMetaInfo.draft_root_path !== options.finalBundleRootPath ||
		draftMetaInfo.draft_timeline_materials_size_ !==
			options.timelineMaterialsSize
	) {
		throw new Error("draft_meta_info.json references are inconsistent.");
	}

	const projectPath = `${options.draftFolderName}/Timelines/project.json`;
	const project = parseJsonRecord({ files, relativePath: projectPath });
	const timelines = project.timelines;
	if (
		project.id !== options.projectId ||
		project.main_timeline_id !== options.timelineId ||
		!(Array.isArray(timelines) && timelines.length === 1) ||
		getRecord({ value: timelines[0] }).id !== options.timelineId
	) {
		throw new Error("Timelines/project.json references are inconsistent.");
	}
	if (
		files.get(projectPath) !==
		files.get(`${options.draftFolderName}/Timelines/project.json.bak`)
	) {
		throw new Error("Timelines/project.json mirrors must be identical.");
	}

	const layout = parseJsonRecord({
		files,
		relativePath: `${options.draftFolderName}/timeline_layout.json`,
	});
	const dockItems = layout.dockItems;
	const dockItem =
		Array.isArray(dockItems) && dockItems.length === 1
			? getRecord({ value: dockItems[0] })
			: undefined;
	if (
		!dockItem ||
		!Array.isArray(dockItem.timelineIds) ||
		dockItem.timelineIds.length !== 1 ||
		dockItem.timelineIds[0] !== options.timelineId
	) {
		throw new Error("timeline_layout.json references are inconsistent.");
	}
}
