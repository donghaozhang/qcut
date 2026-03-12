import * as fs from "node:fs";
import type {
	EditorSnapshotElement,
	EditorSnapshotResult,
} from "../../types/claude-api.js";
import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";

interface SnapshotIdentity {
	key: string;
	element: EditorSnapshotElement;
}

interface SnapshotChangedElement {
	key: string;
	beforeRef: string;
	afterRef: string;
	fields: string[];
	before: Pick<
		EditorSnapshotElement,
		| "role"
		| "tagName"
		| "name"
		| "textPreview"
		| "placeholder"
		| "value"
		| "disabled"
		| "checked"
		| "selected"
		| "expanded"
		| "actionable"
		| "depth"
		| "bounds"
	>;
	after: Pick<
		EditorSnapshotElement,
		| "role"
		| "tagName"
		| "name"
		| "textPreview"
		| "placeholder"
		| "value"
		| "disabled"
		| "checked"
		| "selected"
		| "expanded"
		| "actionable"
		| "depth"
		| "bounds"
	>;
}

interface SnapshotDiffResult {
	mode: "snapshot";
	same: boolean;
	summary: {
		beforeTotal: number;
		afterTotal: number;
		added: number;
		removed: number;
		changed: number;
	};
	added: Array<{
		key: string;
		ref: string;
		role: string | null;
		tagName: string;
		name: string | null;
	}>;
	removed: Array<{
		key: string;
		ref: string;
		role: string | null;
		tagName: string;
		name: string | null;
	}>;
	changed: SnapshotChangedElement[];
}

function extractSnapshotComparableFields({
	element,
}: {
	element: EditorSnapshotElement;
}) {
	return {
		role: element.role,
		tagName: element.tagName,
		name: element.name,
		textPreview: element.textPreview,
		placeholder: element.placeholder,
		value: element.value,
		disabled: element.disabled,
		checked: element.checked,
		selected: element.selected,
		expanded: element.expanded,
		actionable: element.actionable,
		depth: element.depth,
		bounds: element.bounds,
	};
}

function unwrapSnapshotEnvelope({
	value,
}: {
	value: unknown;
}): EditorSnapshotResult {
	if (
		typeof value === "object" &&
		value !== null &&
		"success" in value &&
		"data" in value
	) {
		return validateSnapshotResult({
			value: (value as { data: unknown }).data,
		});
	}

	return validateSnapshotResult({ value });
}

function validateSnapshotResult({
	value,
}: {
	value: unknown;
}): EditorSnapshotResult {
	if (typeof value !== "object" || value === null) {
		throw new Error("Snapshot file must contain an object.");
	}

	const candidate = value as Partial<EditorSnapshotResult>;
	if (!Array.isArray(candidate.elements)) {
		throw new Error("Snapshot file must contain an elements array.");
	}

	return candidate as EditorSnapshotResult;
}

function loadSnapshotFile({
	filePath,
}: {
	filePath: string;
}): EditorSnapshotResult {
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch (error) {
		throw new Error(
			`Cannot read snapshot file '${filePath}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Invalid JSON in snapshot file '${filePath}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	return unwrapSnapshotEnvelope({ value: parsed });
}

function buildSnapshotElementKey({
	element,
}: {
	element: EditorSnapshotElement;
}): string {
	if (element.testId) {
		return `testid:${element.testId}`;
	}
	const semanticParts = [
		element.role ?? "",
		element.tagName,
		element.name ?? "",
		element.placeholder ?? "",
		element.textPreview ?? "",
		String(element.depth),
	];
	if (semanticParts.some((part) => part.length > 0)) {
		return `semantic:${semanticParts.join("|")}`;
	}
	return `ref:${element.ref}`;
}

function buildIdentityBuckets({
	elements,
}: {
	elements: EditorSnapshotElement[];
}): Map<string, SnapshotIdentity[]> {
	const buckets = new Map<string, SnapshotIdentity[]>();
	for (const element of elements) {
		const key = buildSnapshotElementKey({ element });
		const existing = buckets.get(key);
		if (existing) {
			existing.push({ key, element });
			continue;
		}
		buckets.set(key, [{ key, element }]);
	}
	return buckets;
}

function buildAddedOrRemovedElement({
	identity,
}: {
	identity: SnapshotIdentity;
}) {
	return {
		key: identity.key,
		ref: identity.element.ref,
		role: identity.element.role,
		tagName: identity.element.tagName,
		name: identity.element.name,
	};
}

function diffComparableFields({
	before,
	after,
}: {
	before: ReturnType<typeof extractSnapshotComparableFields>;
	after: ReturnType<typeof extractSnapshotComparableFields>;
}): string[] {
	const fields: string[] = [];
	for (const field of Object.keys(before) as Array<keyof typeof before>) {
		if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
			fields.push(field);
		}
	}
	return fields;
}

export async function handleDiffCommand({
	options,
}: {
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	if (action !== "snapshot") {
		return {
			success: false,
			error: `Unknown diff action: ${action}. Available: snapshot`,
		};
	}

	if (!options.before) {
		return {
			success: false,
			error: "Snapshot diff requires --before <path>",
		};
	}
	if (!options.after) {
		return {
			success: false,
			error: "Snapshot diff requires --after <path>",
		};
	}

	const beforeSnapshot = loadSnapshotFile({ filePath: options.before });
	const afterSnapshot = loadSnapshotFile({ filePath: options.after });
	const beforeBuckets = buildIdentityBuckets({
		elements: beforeSnapshot.elements,
	});
	const afterBuckets = buildIdentityBuckets({
		elements: afterSnapshot.elements,
	});

	const added: SnapshotDiffResult["added"] = [];
	const removed: SnapshotDiffResult["removed"] = [];
	const changed: SnapshotDiffResult["changed"] = [];

	const allKeys = new Set([...beforeBuckets.keys(), ...afterBuckets.keys()]);
	for (const key of allKeys) {
		const beforeEntries = [...(beforeBuckets.get(key) ?? [])];
		const afterEntries = [...(afterBuckets.get(key) ?? [])];
		const pairCount = Math.min(beforeEntries.length, afterEntries.length);

		for (const [index, beforeEntry] of beforeEntries.entries()) {
			if (index >= pairCount) {
				removed.push(buildAddedOrRemovedElement({ identity: beforeEntry }));
			}
		}
		for (const [index, afterEntry] of afterEntries.entries()) {
			if (index >= pairCount) {
				added.push(buildAddedOrRemovedElement({ identity: afterEntry }));
			}
		}

		for (let index = 0; index < pairCount; index += 1) {
			const beforeEntry = beforeEntries[index];
			const afterEntry = afterEntries[index];
			if (!beforeEntry || !afterEntry) {
				continue;
			}
			const beforeComparable = extractSnapshotComparableFields({
				element: beforeEntry.element,
			});
			const afterComparable = extractSnapshotComparableFields({
				element: afterEntry.element,
			});
			const fields = diffComparableFields({
				before: beforeComparable,
				after: afterComparable,
			});
			if (fields.length === 0) {
				continue;
			}

			changed.push({
				key,
				beforeRef: beforeEntry.element.ref,
				afterRef: afterEntry.element.ref,
				fields,
				before: beforeComparable,
				after: afterComparable,
			});
		}
	}

	const data: SnapshotDiffResult = {
		mode: "snapshot",
		same: added.length === 0 && removed.length === 0 && changed.length === 0,
		summary: {
			beforeTotal: beforeSnapshot.elements.length,
			afterTotal: afterSnapshot.elements.length,
			added: added.length,
			removed: removed.length,
			changed: changed.length,
		},
		added,
		removed,
		changed,
	};

	return {
		success: true,
		data,
	};
}
