import type {
	SmartPackagingAssetReference,
	SmartPackagingProtocolIssue,
	SmartPackagingSnapshot,
	SmartPackagingTimelinePatch,
	SmartPackagingTimelinePatchOperation,
} from "../templates/smart-packaging-protocol.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposeAssetReference,
	type ComposeAssetType,
	type ComposePatch,
	type ComposePatchOperation,
	type ComposeSnapshot,
} from "./compose-types.js";
import type {
	ComposeValidationIssue,
	ComposeValidationSeverity,
} from "./compose-validation.js";

const SMART_PACKAGING_ASSET_TYPE_MAP: Record<
	SmartPackagingAssetReference["assetType"],
	ComposeAssetType
> = {
	font: "font",
	"text-template": "text-template",
	"text-animation": "text-animation",
	"fancy-word": "fancy-word",
	sticker: "sticker",
	"sound-effect": "sound-effect",
	effect: "filter",
	transition: "transition",
};

function composeAssetFromSmartPackaging({
	asset,
}: {
	asset: SmartPackagingAssetReference;
}): ComposeAssetReference {
	return {
		provider: asset.provider,
		assetType: SMART_PACKAGING_ASSET_TYPE_MAP[asset.assetType],
		assetId: asset.assetId,
		...(asset.cacheKey ? { cacheKey: asset.cacheKey } : {}),
	};
}

function composeOperationFromSmartPackaging({
	operation,
}: {
	operation: SmartPackagingTimelinePatchOperation;
}): ComposePatchOperation {
	switch (operation.kind) {
		case "add-caption":
			return { ...operation };
		case "add-text-overlay": {
			const { asset, ...rest } = operation;
			return asset
				? { ...rest, asset: composeAssetFromSmartPackaging({ asset }) }
				: rest;
		}
		case "add-sticker":
		case "add-sound-effect":
			return {
				...operation,
				asset: composeAssetFromSmartPackaging({ asset: operation.asset }),
			};
		case "update-media-zoom":
			return { ...operation };
		case "upsert-transition":
			return { ...operation };
	}
}

export function composeSnapshotFromSmartPackaging({
	snapshot,
}: {
	snapshot: SmartPackagingSnapshot;
}): ComposeSnapshot {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: snapshot.id,
		createdAt: snapshot.createdAt,
		sourceFingerprint: snapshot.sourceFingerprint,
		project: snapshot.project,
		media: snapshot.media.map((item) => ({ ...item })),
		captions: snapshot.captions.map((caption) => ({ ...caption })),
		beats: snapshot.beats.map((beat, index) => ({
			id: `beat:${index}`,
			timestamp: beat.timestamp,
			...(beat.strength !== undefined ? { confidence: beat.strength } : {}),
		})),
		shots: snapshot.shots.map((shot) => ({
			id: shot.id,
			startTime: shot.startTime,
			duration: shot.endTime - shot.startTime,
		})),
		availableResources: [],
		capabilities: { headlessRender: false, editorApply: true },
	};
}

export function composePatchFromSmartPackaging({
	patch,
}: {
	patch: SmartPackagingTimelinePatch;
}): ComposePatch {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: patch.id,
		source: patch.source,
		intentKind: "smart-packaging",
		mode: "idempotent",
		snapshotId: patch.snapshotId,
		sourceFingerprint: patch.sourceFingerprint,
		createdAt: patch.createdAt,
		...(patch.provider ? { provider: patch.provider } : {}),
		...(patch.remoteTaskId ? { remoteTaskId: patch.remoteTaskId } : {}),
		operations: patch.operations.map((operation) =>
			composeOperationFromSmartPackaging({ operation })
		),
		warnings: [...patch.warnings],
	};
}

// Kept aligned with validateComposeSnapshot, which treats a missing video
// track as advisory rather than blocking.
const SMART_PACKAGING_ISSUE_SEVERITY: Record<
	SmartPackagingProtocolIssue["code"],
	ComposeValidationSeverity
> = {
	"empty-snapshot": "error",
	"invalid-range": "error",
	"missing-main-media": "warning",
	"snapshot-mismatch": "error",
	"invalid-progress": "error",
	"terminal-job-without-result": "error",
};

export function composeIssueFromSmartPackaging({
	issue,
}: {
	issue: SmartPackagingProtocolIssue;
}): ComposeValidationIssue {
	return {
		severity: SMART_PACKAGING_ISSUE_SEVERITY[issue.code],
		code: issue.code,
		path: issue.path,
		message: issue.message,
	};
}
