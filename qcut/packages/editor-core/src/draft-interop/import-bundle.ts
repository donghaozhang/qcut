/**
 * QCutImportBundleV1 — the single shared schema between the import runtime
 * (main process/CLI) and the renderer storage transaction (JYI-009).
 *
 * Pure, versioned, JSON-serializable data: the runtime builds it, the
 * renderer validates it again before staging anything. There is exactly one
 * schema and one validator — the live Electron bridge and the offline inbox
 * both go through `parseQCutImportBundleV1`. Digest hashing happens where
 * crypto lives (node/WebCrypto); this module only defines the canonical
 * serialization both sides hash.
 *
 * @module @qcut/editor-core/draft-interop/import-bundle
 */

import { createDeterministicJianyingId } from "../jianying-draft/deterministic-id.js";
import type {
	QCutImportPlanElement,
	QCutImportPlanTrack,
	QCutImportPlanTransition,
	QCutImportSkippedNode,
	QCutImportTimelinePlanV1,
} from "../jianying-draft/import/qcut-mapping.js";
import { isInteropCapability } from "./capability.js";
import {
	type DraftInteropDocumentV1,
	type InteropResourceKind,
	type InteropResourceStatus,
	parseDraftInteropDocumentV1,
} from "./document.js";
import type { InteropIssue } from "./issues.js";

export const QCUT_IMPORT_BUNDLE_SCHEMA_VERSION = 1 as const;

export type QCutImportProjectNameConflictPolicy = "rename" | "fail";

export interface QCutImportBundleBuildIdentity {
	appVersion: string;
	interopSchemaVersion: number;
}

export interface QCutImportBundleResourceStaging {
	/** Interop resource id inside the bundle document. */
	resourceId: string;
	/** Deterministic staging location key; the renderer must not invent one. */
	stagingKey: string;
	kind: InteropResourceKind;
	status: InteropResourceStatus;
	sha256?: string;
	byteLength?: number;
}

export interface QCutImportBundleV1 {
	schemaVersion: typeof QCUT_IMPORT_BUNDLE_SCHEMA_VERSION;
	/** sha256 hex of the canonical serialization with this field zeroed. */
	bundleDigest: string;
	planToken: string;
	buildIdentity: QCutImportBundleBuildIdentity;
	createdAtUnixMilliseconds: number;
	conflictPolicy: { projectName: QCutImportProjectNameConflictPolicy };
	document: DraftInteropDocumentV1;
	timelinePlan: QCutImportTimelinePlanV1;
	resourceStaging: QCutImportBundleResourceStaging[];
	/** Deterministic semantic-id → QCut entity id mapping. */
	internalIdBySemanticId: Record<string, string>;
}

export const QCUT_IMPORT_BUNDLE_DIGEST_PLACEHOLDER = "0".repeat(64);

/**
 * Deterministic QCut entity id for an imported semantic node. Pure, shared
 * by runtime and renderer, and stable for a given (seed, semanticId) pair —
 * re-planning the same source yields the same internal ids.
 */
export function deriveImportInternalId({
	seed,
	semanticId,
}: {
	seed: string;
	semanticId: string;
}): string {
	return createDeterministicJianyingId({
		namespace: `qcut-import:${seed}`,
		sourceId: semanticId,
	});
}

function sortValueDeep(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortValueDeep);
	}
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			sorted[key] = sortValueDeep(record[key]);
		}
		return sorted;
	}
	return value;
}

/**
 * Canonical serialization both sides hash: keys sorted recursively and the
 * digest field replaced by a fixed placeholder.
 */
export function canonicalizeQCutImportBundleForDigest({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): string {
	const withoutDigest = {
		...bundle,
		bundleDigest: QCUT_IMPORT_BUNDLE_DIGEST_PLACEHOLDER,
	};
	return JSON.stringify(sortValueDeep(withoutDigest));
}

// ---------------------------------------------------------------------------
// Fail-closed structural validation
// ---------------------------------------------------------------------------

export type ParseQCutImportBundleResult =
	| { ok: true; bundle: QCutImportBundleV1 }
	| { ok: false; issues: InteropIssue[] };

class MalformedBundleError extends Error {
	readonly path: string;

	constructor({ message, path }: { message: string; path: string }) {
		super(message);
		this.name = "MalformedBundleError";
		this.path = path;
	}
}

function fail({ message, path }: { message: string; path: string }): never {
	throw new MalformedBundleError({ message, path });
}

function asRecord({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail({ message: "expected an object", path });
	}
	return value as Record<string, unknown>;
}

function asArray({ value, path }: { value: unknown; path: string }): unknown[] {
	if (!Array.isArray(value)) {
		fail({ message: "expected an array", path });
	}
	return value;
}

function asString({
	value,
	path,
	allowEmpty = false,
}: {
	value: unknown;
	path: string;
	allowEmpty?: boolean;
}): string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		fail({ message: "expected a non-empty string", path });
	}
	return value;
}

function asFiniteNumber({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		fail({ message: "expected a finite number", path });
	}
	return value;
}

function asPositiveFiniteNumber({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	const parsed = asFiniteNumber({ value, path });
	if (parsed <= 0) {
		fail({ message: "expected a positive finite number", path });
	}
	return parsed;
}

function asNonNegativeSafeInteger({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		fail({ message: "expected a non-negative safe integer", path });
	}
	return value;
}

function asEnum<T extends string>({
	value,
	path,
	allowed,
}: {
	value: unknown;
	path: string;
	allowed: readonly T[];
}): T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		fail({ message: `expected one of: ${allowed.join(", ")}`, path });
	}
	return value as T;
}

function parsePlanElement({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportPlanElement {
	const record = asRecord({ value, path });
	const speed =
		record.speed === undefined
			? undefined
			: asFiniteNumber({ value: record.speed, path: `${path}/speed` });
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		type: asEnum({
			value: record.type,
			path: `${path}/type`,
			allowed: ["media"],
		}),
		name: asString({
			value: record.name,
			path: `${path}/name`,
			allowEmpty: true,
		}),
		startTime: asFiniteNumber({
			value: record.startTime,
			path: `${path}/startTime`,
		}),
		duration: asFiniteNumber({
			value: record.duration,
			path: `${path}/duration`,
		}),
		trimStart: asFiniteNumber({
			value: record.trimStart,
			path: `${path}/trimStart`,
		}),
		trimEnd: asFiniteNumber({ value: record.trimEnd, path: `${path}/trimEnd` }),
		resourceId: asString({
			value: record.resourceId,
			path: `${path}/resourceId`,
		}),
		...(speed === undefined ? {} : { speed }),
		sourceSegmentId: asString({
			value: record.sourceSegmentId,
			path: `${path}/sourceSegmentId`,
		}),
	};
}

function parsePlanTransition({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportPlanTransition {
	const record = asRecord({ value, path });
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		fromElementId: asString({
			value: record.fromElementId,
			path: `${path}/fromElementId`,
		}),
		toElementId: asString({
			value: record.toElementId,
			path: `${path}/toElementId`,
		}),
		presetId: asEnum({
			value: record.presetId,
			path: `${path}/presetId`,
			allowed: ["dissolve"],
		}),
		type: asEnum({
			value: record.type,
			path: `${path}/type`,
			allowed: ["dissolve"],
		}),
		duration: asPositiveFiniteNumber({
			value: record.duration,
			path: `${path}/duration`,
		}),
		easing: asEnum({
			value: record.easing,
			path: `${path}/easing`,
			allowed: ["easeInOut"],
		}),
	};
}

function parsePlanTrack({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportPlanTrack {
	const record = asRecord({ value, path });
	const isMain =
		record.isMain === undefined
			? undefined
			: record.isMain === true
				? true
				: fail({ message: "expected true or absent", path: `${path}/isMain` });
	const transitions =
		record.transitions === undefined
			? undefined
			: asArray({
					value: record.transitions,
					path: `${path}/transitions`,
				}).map((transition, index) =>
					parsePlanTransition({
						value: transition,
						path: `${path}/transitions/${index}`,
					})
				);
	return {
		id: asString({ value: record.id, path: `${path}/id` }),
		type: asEnum({
			value: record.type,
			path: `${path}/type`,
			allowed: ["media", "audio"],
		}),
		name: asString({ value: record.name, path: `${path}/name` }),
		order: asNonNegativeSafeInteger({
			value: record.order,
			path: `${path}/order`,
		}),
		...(isMain === undefined ? {} : { isMain }),
		elements: asArray({ value: record.elements, path: `${path}/elements` }).map(
			(element, index) =>
				parsePlanElement({ value: element, path: `${path}/elements/${index}` })
		),
		...(transitions === undefined ? {} : { transitions }),
		sourceTrackId: asString({
			value: record.sourceTrackId,
			path: `${path}/sourceTrackId`,
		}),
	};
}

function parseSkippedNode({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportSkippedNode {
	const record = asRecord({ value, path });
	if (!isInteropCapability(record.capability)) {
		fail({
			message: "expected an interop capability",
			path: `${path}/capability`,
		});
	}
	return {
		nodeId: asString({ value: record.nodeId, path: `${path}/nodeId` }),
		nodeType: asEnum({
			value: record.nodeType,
			path: `${path}/nodeType`,
			allowed: ["track", "segment"],
		}),
		capability: record.capability,
		reason: asString({ value: record.reason, path: `${path}/reason` }),
	};
}

function parseTimelinePlan({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportTimelinePlanV1 {
	const record = asRecord({ value, path });
	if (record.schemaVersion !== 1) {
		fail({
			message: "unsupported plan schema version",
			path: `${path}/schemaVersion`,
		});
	}
	const project = asRecord({ value: record.project, path: `${path}/project` });
	const durationSeconds =
		project.durationSeconds === undefined
			? undefined
			: asFiniteNumber({
					value: project.durationSeconds,
					path: `${path}/project/durationSeconds`,
				});
	return {
		schemaVersion: 1,
		project: {
			name: asString({
				value: project.name,
				path: `${path}/project/name`,
				allowEmpty: true,
			}),
			width: asFiniteNumber({
				value: project.width,
				path: `${path}/project/width`,
			}),
			height: asFiniteNumber({
				value: project.height,
				path: `${path}/project/height`,
			}),
			fps: asFiniteNumber({ value: project.fps, path: `${path}/project/fps` }),
			...(durationSeconds === undefined ? {} : { durationSeconds }),
		},
		tracks: asArray({ value: record.tracks, path: `${path}/tracks` }).map(
			(track, index) =>
				parsePlanTrack({ value: track, path: `${path}/tracks/${index}` })
		),
		resourceIds: asArray({
			value: record.resourceIds,
			path: `${path}/resourceIds`,
		}).map((id, index) =>
			asString({ value: id, path: `${path}/resourceIds/${index}` })
		),
		skipped: asArray({ value: record.skipped, path: `${path}/skipped` }).map(
			(node, index) =>
				parseSkippedNode({ value: node, path: `${path}/skipped/${index}` })
		),
	};
}

function parseResourceStaging({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): QCutImportBundleResourceStaging {
	const record = asRecord({ value, path });
	const sha256 =
		record.sha256 === undefined
			? undefined
			: asString({ value: record.sha256, path: `${path}/sha256` });
	const byteLength =
		record.byteLength === undefined
			? undefined
			: asNonNegativeSafeInteger({
					value: record.byteLength,
					path: `${path}/byteLength`,
				});
	const stagingKey = asString({
		value: record.stagingKey,
		path: `${path}/stagingKey`,
	});
	// Staging keys are storage-internal identifiers, never paths.
	if (
		stagingKey.includes("..") ||
		stagingKey.startsWith("/") ||
		stagingKey.includes("\u0000")
	) {
		fail({
			message: "staging key must not be path-like",
			path: `${path}/stagingKey`,
		});
	}
	return {
		resourceId: asString({
			value: record.resourceId,
			path: `${path}/resourceId`,
		}),
		stagingKey,
		kind: asEnum({
			value: record.kind,
			path: `${path}/kind`,
			allowed: [
				"video",
				"image",
				"audio",
				"font",
				"lut",
				"filter",
				"effect",
				"transition-package",
				"unknown",
			],
		}),
		status: asEnum({
			value: record.status,
			path: `${path}/status`,
			allowed: ["resolved", "pending", "missing", "opaque"],
		}),
		...(sha256 === undefined ? {} : { sha256 }),
		...(byteLength === undefined ? {} : { byteLength }),
	};
}

/**
 * Fail-closed validation of an untrusted bundle value. Structural AND
 * cross-referential: the plan may only reference resources the document
 * declares, every plan node needs a deterministic internal id, and the
 * digest field must be well-formed (byte-level digest verification happens
 * in the runtime/renderer where crypto lives).
 */
export function parseQCutImportBundleV1(
	value: unknown
): ParseQCutImportBundleResult {
	try {
		const record = asRecord({ value, path: "" });
		if (record.schemaVersion !== QCUT_IMPORT_BUNDLE_SCHEMA_VERSION) {
			fail({
				message: "unsupported bundle schema version",
				path: "/schemaVersion",
			});
		}
		const bundleDigest = asString({
			value: record.bundleDigest,
			path: "/bundleDigest",
		});
		if (!/^[0-9a-f]{64}$/.test(bundleDigest)) {
			fail({ message: "expected a sha256 hex digest", path: "/bundleDigest" });
		}
		const documentResult = parseDraftInteropDocumentV1(record.document);
		if (!documentResult.ok) {
			return { ok: false, issues: documentResult.issues };
		}
		const buildIdentity = asRecord({
			value: record.buildIdentity,
			path: "/buildIdentity",
		});
		const conflictPolicy = asRecord({
			value: record.conflictPolicy,
			path: "/conflictPolicy",
		});
		const internalIdRecord = asRecord({
			value: record.internalIdBySemanticId,
			path: "/internalIdBySemanticId",
		});
		const internalIdBySemanticId: Record<string, string> = {};
		for (const [semanticId, internalId] of Object.entries(internalIdRecord)) {
			internalIdBySemanticId[semanticId] = asString({
				value: internalId,
				path: `/internalIdBySemanticId/${semanticId}`,
			});
		}

		const bundle: QCutImportBundleV1 = {
			schemaVersion: QCUT_IMPORT_BUNDLE_SCHEMA_VERSION,
			bundleDigest,
			planToken: asString({ value: record.planToken, path: "/planToken" }),
			buildIdentity: {
				appVersion: asString({
					value: buildIdentity.appVersion,
					path: "/buildIdentity/appVersion",
				}),
				interopSchemaVersion: asNonNegativeSafeInteger({
					value: buildIdentity.interopSchemaVersion,
					path: "/buildIdentity/interopSchemaVersion",
				}),
			},
			createdAtUnixMilliseconds: asNonNegativeSafeInteger({
				value: record.createdAtUnixMilliseconds,
				path: "/createdAtUnixMilliseconds",
			}),
			conflictPolicy: {
				projectName: asEnum({
					value: conflictPolicy.projectName,
					path: "/conflictPolicy/projectName",
					allowed: ["rename", "fail"],
				}),
			},
			document: documentResult.document,
			timelinePlan: parseTimelinePlan({
				value: record.timelinePlan,
				path: "/timelinePlan",
			}),
			resourceStaging: asArray({
				value: record.resourceStaging,
				path: "/resourceStaging",
			}).map((entry, index) =>
				parseResourceStaging({
					value: entry,
					path: `/resourceStaging/${index}`,
				})
			),
			internalIdBySemanticId,
		};

		// Cross-references, fail-closed.
		const documentResourceIds = new Set(
			bundle.document.resources.map((resource) => resource.id)
		);
		const stagingByResourceId = new Map(
			bundle.resourceStaging.map((entry) => [entry.resourceId, entry])
		);
		for (const [index, entry] of bundle.resourceStaging.entries()) {
			if (!documentResourceIds.has(entry.resourceId)) {
				fail({
					message: "staging entry references an undeclared resource",
					path: `/resourceStaging/${index}/resourceId`,
				});
			}
			if (internalIdBySemanticId[entry.resourceId] === undefined) {
				fail({
					message: "staged resource has no deterministic internal id",
					path: `/resourceStaging/${index}/resourceId`,
				});
			}
		}
		for (const [trackIndex, track] of bundle.timelinePlan.tracks.entries()) {
			if (internalIdBySemanticId[track.id] === undefined) {
				fail({
					message: "plan track has no deterministic internal id",
					path: `/timelinePlan/tracks/${trackIndex}/id`,
				});
			}
			for (const [elementIndex, element] of track.elements.entries()) {
				const elementPath = `/timelinePlan/tracks/${trackIndex}/elements/${elementIndex}`;
				if (internalIdBySemanticId[element.id] === undefined) {
					fail({
						message: "plan element has no deterministic internal id",
						path: `${elementPath}/id`,
					});
				}
				if (!stagingByResourceId.has(element.resourceId)) {
					fail({
						message: "plan element references an unstaged resource",
						path: `${elementPath}/resourceId`,
					});
				}
			}
			const elementIds = new Set(track.elements.map((element) => element.id));
			for (const [transitionIndex, transition] of (
				track.transitions ?? []
			).entries()) {
				const transitionPath = `/timelinePlan/tracks/${trackIndex}/transitions/${transitionIndex}`;
				if (track.type !== "media") {
					fail({
						message: "plan transitions require a media track",
						path: transitionPath,
					});
				}
				if (internalIdBySemanticId[transition.id] === undefined) {
					fail({
						message: "plan transition has no deterministic internal id",
						path: `${transitionPath}/id`,
					});
				}
				if (
					transition.fromElementId === transition.toElementId ||
					!elementIds.has(transition.fromElementId) ||
					!elementIds.has(transition.toElementId)
				) {
					fail({
						message: "plan transition endpoints must exist on the same track",
						path: transitionPath,
					});
				}
			}
		}
		return { ok: true, bundle };
	} catch (error) {
		if (error instanceof MalformedBundleError) {
			return {
				ok: false,
				issues: [
					{
						code: "DOCUMENT_MALFORMED",
						severity: "error",
						message: error.message,
						path: error.path,
					},
				],
			};
		}
		throw error;
	}
}
