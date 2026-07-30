import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	JianyingDraftTargetPlatform,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import {
	assertNoUnknownKeys,
	assertStringLiteral,
	cloneJsonValue,
	deepFreeze,
	getFiniteNumber,
	getRecord,
	getString,
	StandaloneJianyingDraftRequestValidationError,
	type StandaloneJianyingDraftRequestValidationIssue,
	validationIssue,
} from "./runtime-json.js";
import { validateSnapshot } from "./snapshot-runtime-validation.js";

const PLAN_REQUEST_KEYS = new Set([
	"createdAtUnixSeconds",
	"draftName",
	"outputParentDirectory",
	"snapshot",
	"targetPlatform",
]);
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";

export interface StandaloneJianyingDraftPlanRequest {
	createdAtUnixSeconds?: number;
	draftName: string;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface NormalizedStandaloneJianyingDraftPlanRequest {
	createdAtUnixSeconds: number;
	draftName: string;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export {
	StandaloneJianyingDraftRequestValidationError,
	type StandaloneJianyingDraftRequestValidationIssue,
};

async function normalizeMediaSourcePaths({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): Promise<QCutDraftExportSnapshotV1> {
	const media = await Promise.all(
		snapshot.media.map(async (item, index) => {
			let sourcePath: string;
			try {
				sourcePath = await realpath(resolve(item.sourcePath));
				const metadata = await stat(sourcePath);
				if (!metadata.isFile()) {
					throw new Error("Media source must resolve to a regular file.");
				}
			} catch (error) {
				throw validationIssue({
					message: `Media source cannot be resolved: ${
						error instanceof Error ? error.message : String(error)
					}`,
					path: `$.snapshot.media[${index}].sourcePath`,
				});
			}
			return { ...item, sourcePath };
		})
	);
	return { ...snapshot, media };
}

export async function normalizeStandaloneJianyingDraftPlanRequest({
	input,
	nowUnixMilliseconds,
}: {
	input: unknown;
	nowUnixMilliseconds: number;
}): Promise<NormalizedStandaloneJianyingDraftPlanRequest> {
	const request = getRecord({
		path: "$",
		value: cloneJsonValue({ value: input }),
	});
	assertNoUnknownKeys({
		allowed: PLAN_REQUEST_KEYS,
		path: "$",
		record: request,
	});
	const draftName = getString({ path: "$.draftName", value: request.draftName })
		.normalize("NFC")
		.trim();
	const outputParentInput = getString({
		path: "$.outputParentDirectory",
		value: request.outputParentDirectory,
	});
	const targetPlatform = assertStringLiteral({
		allowed: new Set(["macos", "windows"]),
		path: "$.targetPlatform",
		value: request.targetPlatform,
	}) as JianyingDraftTargetPlatform;
	const createdAtUnixSeconds =
		request.createdAtUnixSeconds === undefined
			? Math.floor(nowUnixMilliseconds / 1000)
			: getFiniteNumber({
					path: "$.createdAtUnixSeconds",
					value: request.createdAtUnixSeconds,
				});
	const snapshot = validateSnapshot({
		path: "$.snapshot",
		value: request.snapshot,
	});

	let outputParentDirectory: string;
	try {
		outputParentDirectory = await realpath(resolve(outputParentInput));
		const outputParentMetadata = await stat(outputParentDirectory);
		if (!outputParentMetadata.isDirectory()) {
			throw new Error("Path is not a directory.");
		}
		const targetsApplicationDraftStore = outputParentDirectory
			.split(/[\\/]+/)
			.some(
				(part) =>
					part.toLowerCase() === DRAFT_STORE_DIRECTORY_NAME.toLowerCase()
			);
		if (targetsApplicationDraftStore) {
			throw new Error(
				"Standalone export cannot target an application draft store."
			);
		}
	} catch (error) {
		throw validationIssue({
			message: `Output parent cannot be resolved as a directory: ${
				error instanceof Error ? error.message : String(error)
			}`,
			path: "$.outputParentDirectory",
		});
	}

	const normalizedSnapshot = await normalizeMediaSourcePaths({ snapshot });
	return deepFreeze({
		value: {
			createdAtUnixSeconds,
			draftName,
			outputParentDirectory,
			snapshot: normalizedSnapshot,
			targetPlatform,
		},
	});
}
