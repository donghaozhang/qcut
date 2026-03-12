import * as fs from "node:fs";
import * as path from "node:path";
import type {
	EditorSnapshotElement,
	EditorSnapshotResult,
} from "../../types/claude-api.js";
import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";

interface ScreenshotDiffResult {
	mode: "screenshot";
	same: boolean;
	summary: {
		beforeDimensions: { width: number; height: number };
		afterDimensions: { width: number; height: number };
		dimensionsMatch: boolean;
		totalPixels: number;
		changedPixels: number;
		changePercent: number;
	};
	diffImagePath: string | null;
}

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

	if (action !== "snapshot" && action !== "screenshot") {
		return {
			success: false,
			error: `Unknown diff action: ${action}. Available: snapshot, screenshot`,
		};
	}

	if (!options.before) {
		return {
			success: false,
			error: `${action === "snapshot" ? "Snapshot" : "Screenshot"} diff requires --before <path>`,
		};
	}
	if (!options.after) {
		return {
			success: false,
			error: `${action === "snapshot" ? "Snapshot" : "Screenshot"} diff requires --after <path>`,
		};
	}

	if (action === "screenshot") {
		return handleScreenshotDiff({ options });
	}

	return handleSnapshotDiff({ options });
}

async function handleScreenshotDiff({
	options,
}: {
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const beforePath = options.before as string;
	const afterPath = options.after as string;

	for (const filePath of [beforePath, afterPath]) {
		if (!fs.existsSync(filePath)) {
			return {
				success: false,
				error: `Screenshot file not found: ${filePath}`,
			};
		}
	}

	let sharp: typeof import("sharp")["default"];
	try {
		// Use Function constructor to avoid Vite's static import analysis
		// sharp is a native module that can't be bundled by Vite
		const moduleName = "sharp";
		sharp = (await import(/* @vite-ignore */ moduleName)).default;
	} catch {
		return {
			success: false,
			error:
				"sharp is required for screenshot diff but could not be loaded",
		};
	}

	const beforeImg = sharp(beforePath);
	const afterImg = sharp(afterPath);
	const [beforeMeta, afterMeta] = await Promise.all([
		beforeImg.metadata(),
		afterImg.metadata(),
	]);

	const beforeWidth = beforeMeta.width ?? 0;
	const beforeHeight = beforeMeta.height ?? 0;
	const afterWidth = afterMeta.width ?? 0;
	const afterHeight = afterMeta.height ?? 0;
	const dimensionsMatch =
		beforeWidth === afterWidth && beforeHeight === afterHeight;

	// For mismatched dimensions, resize the after image to match before
	const compareWidth = beforeWidth;
	const compareHeight = beforeHeight;

	const [beforeRaw, afterRaw] = await Promise.all([
		beforeImg
			.raw()
			.ensureAlpha()
			.toBuffer(),
		(dimensionsMatch
			? afterImg
			: afterImg.resize(compareWidth, compareHeight, { fit: "fill" })
		)
			.raw()
			.ensureAlpha()
			.toBuffer(),
	]);

	const totalPixels = compareWidth * compareHeight;
	let changedPixels = 0;
	const diffBuffer = Buffer.alloc(totalPixels * 4);
	const threshold = options.threshold ?? 10;

	for (let i = 0; i < totalPixels; i += 1) {
		const offset = i * 4;
		const rDiff = Math.abs(beforeRaw[offset] - afterRaw[offset]);
		const gDiff = Math.abs(beforeRaw[offset + 1] - afterRaw[offset + 1]);
		const bDiff = Math.abs(beforeRaw[offset + 2] - afterRaw[offset + 2]);
		const aDiff = Math.abs(beforeRaw[offset + 3] - afterRaw[offset + 3]);

		if (rDiff > threshold || gDiff > threshold || bDiff > threshold || aDiff > threshold) {
			changedPixels += 1;
			// Red highlight for diff pixels
			diffBuffer[offset] = 255;
			diffBuffer[offset + 1] = 0;
			diffBuffer[offset + 2] = 0;
			diffBuffer[offset + 3] = 255;
		} else {
			// Dimmed original for unchanged pixels
			diffBuffer[offset] = Math.floor(beforeRaw[offset] * 0.3);
			diffBuffer[offset + 1] = Math.floor(beforeRaw[offset + 1] * 0.3);
			diffBuffer[offset + 2] = Math.floor(beforeRaw[offset + 2] * 0.3);
			diffBuffer[offset + 3] = 255;
		}
	}

	// Save the diff image next to the before file
	const diffDir = path.dirname(beforePath);
	const diffName = `diff-${Date.now()}.png`;
	const diffImagePath = path.join(diffDir, diffName);

	await sharp(diffBuffer, {
		raw: { width: compareWidth, height: compareHeight, channels: 4 },
	})
		.png()
		.toFile(diffImagePath);

	const changePercent =
		totalPixels > 0
			? Math.round((changedPixels / totalPixels) * 10000) / 100
			: 0;

	const data: ScreenshotDiffResult = {
		mode: "screenshot",
		same: changedPixels === 0,
		summary: {
			beforeDimensions: { width: beforeWidth, height: beforeHeight },
			afterDimensions: { width: afterWidth, height: afterHeight },
			dimensionsMatch,
			totalPixels,
			changedPixels,
			changePercent,
		},
		diffImagePath,
	};

	return { success: true, data };
}

function handleSnapshotDiff({
	options,
}: {
	options: CLIRunOptions;
}): CLIResult {
	const beforeSnapshot = loadSnapshotFile({
		filePath: options.before as string,
	});
	const afterSnapshot = loadSnapshotFile({
		filePath: options.after as string,
	});
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

	return { success: true, data };
}
