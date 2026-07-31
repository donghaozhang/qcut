import type {
	JianyingDraftTargetPlatform,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import {
	assertNoUnknownKeys,
	cloneJsonValue,
	getRecord,
	type JsonValue,
} from "./runtime-json.js";
import {
	normalizeStandaloneJianyingDraftPlanRequest,
	type NormalizedStandaloneJianyingDraftPlanRequest,
} from "./runtime-validation.js";

const MIGRATION_PLAN_REQUEST_KEYS = new Set([
	"createdAtUnixSeconds",
	"draftName",
	"snapshot",
	"targetPlatform",
]);

export interface CapCut81MigrationPlanRequest {
	createdAtUnixSeconds?: number;
	draftName: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

function copyPresentProperty({
	key,
	request,
	target,
}: {
	key: string;
	request: { [key: string]: JsonValue };
	target: Record<string, JsonValue>;
}): void {
	const value = request[key];
	if (value !== undefined) {
		target[key] = value;
	}
}

export async function normalizeCapCut81MigrationPlanRequest({
	allowedSourceRootDirectory,
	input,
	nowUnixMilliseconds,
	outputParentDirectory,
}: {
	allowedSourceRootDirectory?: string;
	input: unknown;
	nowUnixMilliseconds: number;
	outputParentDirectory: string;
}): Promise<NormalizedStandaloneJianyingDraftPlanRequest> {
	const request = getRecord({
		path: "$",
		value: cloneJsonValue({ value: input }),
	});
	assertNoUnknownKeys({
		allowed: MIGRATION_PLAN_REQUEST_KEYS,
		path: "$",
		record: request,
	});

	const standaloneRequest: Record<string, JsonValue> = {
		outputParentDirectory,
	};
	for (const key of MIGRATION_PLAN_REQUEST_KEYS) {
		copyPresentProperty({ key, request, target: standaloneRequest });
	}
	return normalizeStandaloneJianyingDraftPlanRequest({
		...(allowedSourceRootDirectory === undefined
			? {}
			: { allowedSourceRootDirectory }),
		input: standaloneRequest,
		nowUnixMilliseconds,
	});
}
