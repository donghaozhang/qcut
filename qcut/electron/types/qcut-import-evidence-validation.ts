import {
	QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
	type QCutPersistedImportEvidenceMedia,
	type QCutPersistedImportEvidenceRequest,
	type QCutPersistedImportEvidenceSnapshot,
} from "./qcut-import-evidence-api.js";

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireExactKeys({
	keys,
	label,
	record,
}: {
	keys: readonly string[];
	label: string;
	record: Record<string, unknown>;
}): void {
	const expected = new Set(keys);
	for (const key of Object.keys(record)) {
		if (!expected.has(key)) {
			throw new Error(`${label} contains unsupported field '${key}'.`);
		}
	}
	for (const key of keys) {
		if (!(key in record)) {
			throw new Error(`${label} is missing field '${key}'.`);
		}
	}
}

function requireString({
	label,
	maximumLength = 512,
	value,
}: {
	label: string;
	maximumLength?: number;
	value: unknown;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maximumLength ||
		value.includes("\0")
	) {
		throw new Error(`${label} must be a bounded non-empty string.`);
	}
	return value;
}

function requireSha256({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const digest = requireString({ label, maximumLength: 64, value });
	if (!/^[a-f0-9]{64}$/.test(digest)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return digest;
}

function requirePositiveNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive finite number.`);
	}
	return value;
}

function requireByteLength({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} must be a non-negative safe integer.`);
	}
	return value;
}

function requireMediaType({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): QCutPersistedImportEvidenceMedia["type"] {
	if (value !== "audio" && value !== "image" && value !== "video") {
		throw new Error(`${label} is unsupported.`);
	}
	return value;
}

function parseMedia({
	value,
}: {
	value: unknown;
}): QCutPersistedImportEvidenceMedia[] {
	if (!Array.isArray(value)) {
		throw new Error("Persisted import evidence media must be an array.");
	}
	return value.map((entry, index) => {
		const label = `Persisted import evidence media ${index}`;
		const record = requireRecord({ label, value: entry });
		requireExactKeys({
			keys: ["byteLength", "id", "sha256", "type"],
			label,
			record,
		});
		return {
			byteLength: requireByteLength({
				label: `${label} byteLength`,
				value: record.byteLength,
			}),
			id: requireString({ label: `${label} id`, value: record.id }),
			sha256: requireSha256({
				label: `${label} sha256`,
				value: record.sha256,
			}),
			type: requireMediaType({ label: `${label} type`, value: record.type }),
		};
	});
}

function parseTracks({ value }: { value: unknown }): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error("Persisted import evidence tracks must be an array.");
	}
	return value.map((entry, index) => {
		const label = `Persisted import evidence track ${index}`;
		const track = requireRecord({ label, value: entry });
		requireString({ label: `${label} id`, value: track.id });
		if (!Array.isArray(track.elements)) {
			throw new Error(`${label} elements must be an array.`);
		}
		return track;
	});
}

export function parseQCutPersistedImportEvidenceRequest({
	value,
}: {
	value: unknown;
}): QCutPersistedImportEvidenceRequest {
	const record = requireRecord({
		label: "Persisted import evidence request",
		value,
	});
	requireExactKeys({
		keys: ["expectedBundleDigest", "projectId"],
		label: "Persisted import evidence request",
		record,
	});
	return {
		expectedBundleDigest: requireSha256({
			label: "Expected bundle digest",
			value: record.expectedBundleDigest,
		}),
		projectId: requireString({
			label: "Project id",
			maximumLength: 256,
			value: record.projectId,
		}),
	};
}

export function parseQCutPersistedImportEvidenceSnapshot({
	value,
}: {
	value: unknown;
}): QCutPersistedImportEvidenceSnapshot {
	const root = requireRecord({
		label: "Persisted import evidence",
		value,
	});
	requireExactKeys({
		keys: [
			"binding",
			"capture",
			"media",
			"project",
			"schema",
			"schemaVersion",
			"tracks",
		],
		label: "Persisted import evidence",
		record: root,
	});
	if (
		root.schema !== QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA ||
		root.schemaVersion !== 1
	) {
		throw new Error("Persisted import evidence schema is unsupported.");
	}
	const binding = requireRecord({
		label: "Persisted import evidence binding",
		value: root.binding,
	});
	requireExactKeys({
		keys: ["bundleDigest", "importId", "profileId"],
		label: "Persisted import evidence binding",
		record: binding,
	});
	const capture = requireRecord({
		label: "Persisted import evidence capture",
		value: root.capture,
	});
	requireExactKeys({
		keys: ["appVersion", "capturedAtIso", "readPasses", "source"],
		label: "Persisted import evidence capture",
		record: capture,
	});
	if (
		capture.readPasses !== 2 ||
		capture.source !== "qcut-renderer-persisted-storage"
	) {
		throw new Error("Persisted import evidence capture source is not trusted.");
	}
	const capturedAtIso = requireString({
		label: "Persisted import evidence capture time",
		value: capture.capturedAtIso,
	});
	if (
		!Number.isFinite(Date.parse(capturedAtIso)) ||
		new Date(capturedAtIso).toISOString() !== capturedAtIso
	) {
		throw new Error("Persisted import evidence capture time is invalid.");
	}
	const project = requireRecord({
		label: "Persisted import evidence project",
		value: root.project,
	});
	requireExactKeys({
		keys: ["fps", "height", "id", "name", "sceneId", "width"],
		label: "Persisted import evidence project",
		record: project,
	});
	return {
		binding: {
			bundleDigest: requireSha256({
				label: "Persisted bundle digest",
				value: binding.bundleDigest,
			}),
			importId: requireString({
				label: "Persisted import id",
				value: binding.importId,
			}),
			profileId: requireString({
				label: "Persisted profile id",
				value: binding.profileId,
			}),
		},
		capture: {
			appVersion: requireString({
				label: "Persisted import evidence app version",
				value: capture.appVersion,
			}),
			capturedAtIso,
			readPasses: 2,
			source: "qcut-renderer-persisted-storage",
		},
		media: parseMedia({ value: root.media }),
		project: {
			fps: requirePositiveNumber({ label: "Project FPS", value: project.fps }),
			height: requirePositiveNumber({
				label: "Project height",
				value: project.height,
			}),
			id: requireString({ label: "Project id", value: project.id }),
			name: requireString({ label: "Project name", value: project.name }),
			sceneId: requireString({
				label: "Project scene id",
				value: project.sceneId,
			}),
			width: requirePositiveNumber({
				label: "Project width",
				value: project.width,
			}),
		},
		schema: QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1,
		tracks: parseTracks({ value: root.tracks }),
	};
}
