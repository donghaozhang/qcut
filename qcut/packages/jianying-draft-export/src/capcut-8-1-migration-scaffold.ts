import {
	createCapCut81ActionSceneAttachment,
	createCapCut81AgencyConfig,
	createCapCut81DraftMetaInfo,
	createCapCut81EditingAttachment,
	createCapCut81GenAiAttachment,
	createCapCut81PcCommonAttachment,
	createCapCut81PcTimelineAttachment,
	createCapCut81PerformanceInfo,
	createCapCut81RootDraftStoreEntry,
	createCapCut81RootMetaInfo,
	createCapCut81ScriptVideoAttachment,
	createCapCut81TimelineLayout,
	createCapCut81TimelineProject,
} from "./capcut-8-1-migration-sidecar-data.js";
import type {
	BuildCapCut81MigrationScaffoldOptions,
	CapCut81MigrationScaffold,
} from "./capcut-8-1-migration-types.js";
import {
	compareCapCut81SidecarPaths,
	getCapCut81AbsolutePathApi,
	validateCapCut81MigrationOptions,
	validateCapCut81MigrationScaffold,
} from "./capcut-8-1-migration-validation.js";

export { validateCapCut81MigrationScaffold };
export type {
	BuildCapCut81MigrationScaffoldOptions,
	CapCut81MigrationScaffold,
};

function serializeJson({ value }: { value: unknown }): string {
	return JSON.stringify(value);
}

function createDraftSettings({
	createdAtMicroseconds,
	updatedAtMicroseconds,
}: {
	createdAtMicroseconds: number;
	updatedAtMicroseconds: number;
}): string {
	const createdAtSeconds = Math.floor(createdAtMicroseconds / 1_000_000);
	const updatedAtSeconds = Math.floor(updatedAtMicroseconds / 1_000_000);
	const realEditSeconds = Math.floor(
		(updatedAtMicroseconds - createdAtMicroseconds) / 1_000_000
	);
	return [
		"[General]",
		`draft_create_time=${createdAtSeconds}`,
		`draft_last_edit_time=${updatedAtSeconds}`,
		"real_edit_keys=1",
		`real_edit_seconds=${realEditSeconds}`,
		"",
	].join("\n");
}

export function buildCapCut81MigrationScaffold({
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
}: BuildCapCut81MigrationScaffoldOptions): CapCut81MigrationScaffold {
	const options: BuildCapCut81MigrationScaffoldOptions = {
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
	};
	validateCapCut81MigrationOptions(options);
	const pathApi = getCapCut81AbsolutePathApi({
		finalBundleRootPath: options.finalBundleRootPath,
	});
	const draftDirectoryPath = pathApi.join(
		options.finalBundleRootPath,
		options.draftFolderName
	);
	const metadataOptions = {
		createdAtMicroseconds: options.createdAtMicroseconds,
		draftCoverPath: pathApi.join(draftDirectoryPath, "draft_cover.jpg"),
		draftDirectoryPath,
		draftId: options.draftId,
		draftInfoPath: pathApi.join(draftDirectoryPath, "draft_info.json"),
		draftName: options.draftName,
		durationMicroseconds: options.durationMicroseconds,
		rootPath: options.finalBundleRootPath,
		timelineMaterialsSize: options.timelineMaterialsSize,
		updatedAtMicroseconds: options.updatedAtMicroseconds,
	};
	const rootEntry = createCapCut81RootDraftStoreEntry(metadataOptions);
	const rootMetaInfo = createCapCut81RootMetaInfo({
		entry: rootEntry,
		rootPath: options.finalBundleRootPath,
	});
	const draftMetaInfo = createCapCut81DraftMetaInfo(metadataOptions);
	const editingAttachment = serializeJson({
		value: createCapCut81EditingAttachment(),
	});
	const pcCommonAttachment = serializeJson({
		value: createCapCut81PcCommonAttachment(),
	});
	const commonAttachments = {
		"attachment_action_scene.json": serializeJson({
			value: createCapCut81ActionSceneAttachment(),
		}),
		"attachment_gen_ai_info.json": serializeJson({
			value: createCapCut81GenAiAttachment(),
		}),
		"attachment_pc_timeline.json": serializeJson({
			value: createCapCut81PcTimelineAttachment(),
		}),
		"attachment_script_video.json": serializeJson({
			value: createCapCut81ScriptVideoAttachment(),
		}),
	};
	const timelineProject = serializeJson({
		value: createCapCut81TimelineProject({
			createdAtMicroseconds: options.createdAtMicroseconds,
			projectId: options.projectId,
			timelineId: options.timelineId,
			updatedAtMicroseconds: options.updatedAtMicroseconds,
		}),
	});
	const timelineDirectory = `${options.draftFolderName}/Timelines/${options.timelineId}`;
	const entries: Array<readonly [string, string]> = [
		["root_meta_info.json", serializeJson({ value: rootMetaInfo })],
		[
			`${options.draftFolderName}/draft_meta_info.json`,
			serializeJson({ value: draftMetaInfo }),
		],
		[`${options.draftFolderName}/attachment_editing.json`, editingAttachment],
		[
			`${options.draftFolderName}/attachment_pc_common.json`,
			pcCommonAttachment,
		],
		[
			`${options.draftFolderName}/draft_agency_config.json`,
			serializeJson({
				value: createCapCut81AgencyConfig({
					canvasHeight: options.canvasHeight,
				}),
			}),
		],
		[`${options.draftFolderName}/draft_biz_config.json`, ""],
		[
			`${options.draftFolderName}/draft_settings`,
			createDraftSettings({
				createdAtMicroseconds: options.createdAtMicroseconds,
				updatedAtMicroseconds: options.updatedAtMicroseconds,
			}),
		],
		[
			`${options.draftFolderName}/performance_opt_info.json`,
			serializeJson({ value: createCapCut81PerformanceInfo() }),
		],
		[
			`${options.draftFolderName}/timeline_layout.json`,
			serializeJson({
				value: createCapCut81TimelineLayout({
					timelineId: options.timelineId,
				}),
			}),
		],
		[`${options.draftFolderName}/Timelines/project.json`, timelineProject],
		[`${options.draftFolderName}/Timelines/project.json.bak`, timelineProject],
		[`${timelineDirectory}/attachment_editing.json`, editingAttachment],
		[`${timelineDirectory}/attachment_pc_common.json`, pcCommonAttachment],
	];
	for (const [fileName, text] of Object.entries(commonAttachments)) {
		entries.push([
			`${options.draftFolderName}/common_attachment/${fileName}`,
			text,
		]);
		entries.push([`${timelineDirectory}/common_attachment/${fileName}`, text]);
	}
	entries.sort(([left], [right]) =>
		compareCapCut81SidecarPaths({ left, right })
	);
	const files = new Map(entries);
	validateCapCut81MigrationScaffold({ files, options });
	return files;
}
