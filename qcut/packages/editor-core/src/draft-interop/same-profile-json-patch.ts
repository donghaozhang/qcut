import {
	evaluateUnknownSubtrees,
	type InteropDirtyDomain,
	type UnknownSubtreeOwnership,
} from "./dirty-domains.js";

export type SameProfileJsonScalar = boolean | number | string | null;

export interface SameProfileScalarPatch {
	foreignRef: string;
	file: string;
	jsonPointer: string;
	ownerSemanticId: string;
	domain: InteropDirtyDomain;
	expectedValue: SameProfileJsonScalar;
	nextValue: SameProfileJsonScalar;
}

export type SameProfileJsonPatchErrorCode =
	| "SOURCE_INVALID_UTF8"
	| "SOURCE_INVALID_JSON"
	| "PATCH_FILE_MISMATCH"
	| "PATCH_POINTER_INVALID"
	| "PATCH_POINTER_UNSAFE"
	| "PATCH_POINTER_MISSING"
	| "PATCH_POINTER_OVERLAP"
	| "PATCH_TARGET_NOT_SCALAR"
	| "PATCH_VALUE_INVALID"
	| "PATCH_VALUE_TYPE_MISMATCH"
	| "PATCH_PRECONDITION_FAILED"
	| "UNKNOWN_SUBTREE_CONFLICT"
	| "UNKNOWN_SUBTREE_DROP_UNSUPPORTED";

export type ApplySameProfileScalarPatchesResult =
	| {
			ok: true;
			document: unknown;
			outputBytes: Uint8Array;
			appliedForeignRefs: string[];
	  }
	| {
			ok: false;
			code: SameProfileJsonPatchErrorCode;
			message: string;
			foreignRef?: string;
	  };

interface ResolvedPatchTarget {
	container: Record<string, unknown> | unknown[];
	key: string | number;
	patch: SameProfileScalarPatch;
}

const UNSAFE_POINTER_SEGMENTS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonScalar(value: unknown): value is SameProfileJsonScalar {
	return (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string" ||
		(typeof value === "number" && Number.isFinite(value))
	);
}

function scalarType({ value }: { value: SameProfileJsonScalar }): string {
	return value === null ? "null" : typeof value;
}

function scalarEquals({
	left,
	right,
}: {
	left: SameProfileJsonScalar;
	right: SameProfileJsonScalar;
}): boolean {
	return Object.is(left, right);
}

function decodePointerSegment({ segment }: { segment: string }): string | null {
	if (/~(?:[^01]|$)/u.test(segment)) return null;
	return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function parseJsonPointer({
	jsonPointer,
}: {
	jsonPointer: string;
}):
	| { ok: true; segments: string[] }
	| { ok: false; code: SameProfileJsonPatchErrorCode; message: string } {
	if (jsonPointer.length === 0 || !jsonPointer.startsWith("/")) {
		return {
			ok: false,
			code: "PATCH_POINTER_INVALID",
			message: "Scalar patches must target a non-root JSON Pointer.",
		};
	}
	const segments: string[] = [];
	for (const encodedSegment of jsonPointer.slice(1).split("/")) {
		const segment = decodePointerSegment({ segment: encodedSegment });
		if (segment === null) {
			return {
				ok: false,
				code: "PATCH_POINTER_INVALID",
				message: `JSON Pointer ${jsonPointer} contains an invalid escape.`,
			};
		}
		if (UNSAFE_POINTER_SEGMENTS.has(segment)) {
			return {
				ok: false,
				code: "PATCH_POINTER_UNSAFE",
				message: `JSON Pointer ${jsonPointer} contains an unsafe segment.`,
			};
		}
		segments.push(segment);
	}
	return { ok: true, segments };
}

function getArrayIndex({
	segment,
	length,
}: {
	segment: string;
	length: number;
}): number | null {
	if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) return null;
	const index = Number(segment);
	return Number.isSafeInteger(index) && index < length ? index : null;
}

function getChild({
	container,
	segment,
}: {
	container: unknown;
	segment: string;
}): { found: true; value: unknown } | { found: false } {
	if (Array.isArray(container)) {
		const index = getArrayIndex({ segment, length: container.length });
		return index === null
			? { found: false }
			: { found: true, value: container[index] };
	}
	if (!isRecord(container) || !Object.hasOwn(container, segment)) {
		return { found: false };
	}
	return { found: true, value: container[segment] };
}

function resolvePatchTarget({
	document,
	patch,
}: {
	document: unknown;
	patch: SameProfileScalarPatch;
}):
	| { ok: true; target: ResolvedPatchTarget }
	| {
			ok: false;
			code: SameProfileJsonPatchErrorCode;
			message: string;
			foreignRef: string;
	  } {
	const parsedPointer = parseJsonPointer({ jsonPointer: patch.jsonPointer });
	if (!parsedPointer.ok) {
		return { ...parsedPointer, foreignRef: patch.foreignRef };
	}

	let container: unknown = document;
	const parentSegments = parsedPointer.segments.slice(0, -1);
	for (const segment of parentSegments) {
		const child = getChild({ container, segment });
		if (!child.found) {
			return {
				ok: false,
				code: "PATCH_POINTER_MISSING",
				message: `JSON Pointer ${patch.jsonPointer} does not exist.`,
				foreignRef: patch.foreignRef,
			};
		}
		container = child.value;
	}

	const finalSegment = parsedPointer.segments.at(-1);
	if (finalSegment === undefined) {
		return {
			ok: false,
			code: "PATCH_POINTER_INVALID",
			message: "Scalar patches cannot replace the document root.",
			foreignRef: patch.foreignRef,
		};
	}
	if (Array.isArray(container)) {
		const index = getArrayIndex({
			segment: finalSegment,
			length: container.length,
		});
		if (index === null) {
			return {
				ok: false,
				code: "PATCH_POINTER_MISSING",
				message: `JSON Pointer ${patch.jsonPointer} does not exist.`,
				foreignRef: patch.foreignRef,
			};
		}
		return { ok: true, target: { container, key: index, patch } };
	}
	if (!isRecord(container) || !Object.hasOwn(container, finalSegment)) {
		return {
			ok: false,
			code: "PATCH_POINTER_MISSING",
			message: `JSON Pointer ${patch.jsonPointer} does not exist.`,
			foreignRef: patch.foreignRef,
		};
	}
	return {
		ok: true,
		target: { container, key: finalSegment, patch },
	};
}

function readTargetValue({ target }: { target: ResolvedPatchTarget }): unknown {
	return target.container[target.key as never];
}

function setTargetValue({ target }: { target: ResolvedPatchTarget }): void {
	if (Array.isArray(target.container) && typeof target.key === "number") {
		target.container[target.key] = target.patch.nextValue;
		return;
	}
	if (!Array.isArray(target.container) && typeof target.key === "string") {
		Object.defineProperty(target.container, target.key, {
			configurable: true,
			enumerable: true,
			writable: true,
			value: target.patch.nextValue,
		});
	}
}

function pointersOverlap({
	left,
	right,
}: {
	left: string;
	right: string;
}): boolean {
	return (
		left === right ||
		left.startsWith(`${right}/`) ||
		right.startsWith(`${left}/`)
	);
}

function validatePatchSet({
	patches,
	relativePath,
}: {
	patches: readonly SameProfileScalarPatch[];
	relativePath: string;
}): ApplySameProfileScalarPatchesResult | null {
	for (const patch of patches) {
		if (patch.file !== relativePath) {
			return {
				ok: false,
				code: "PATCH_FILE_MISMATCH",
				message: `Patch ${patch.foreignRef} targets ${patch.file}, not ${relativePath}.`,
				foreignRef: patch.foreignRef,
			};
		}
		if (!isJsonScalar(patch.expectedValue) || !isJsonScalar(patch.nextValue)) {
			return {
				ok: false,
				code: "PATCH_VALUE_INVALID",
				message: `Patch ${patch.foreignRef} contains a non-JSON scalar value.`,
				foreignRef: patch.foreignRef,
			};
		}
		if (
			scalarType({ value: patch.expectedValue }) !==
			scalarType({ value: patch.nextValue })
		) {
			return {
				ok: false,
				code: "PATCH_VALUE_TYPE_MISMATCH",
				message: `Patch ${patch.foreignRef} changes the target scalar type.`,
				foreignRef: patch.foreignRef,
			};
		}
	}
	for (let leftIndex = 0; leftIndex < patches.length; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < patches.length;
			rightIndex += 1
		) {
			const left = patches[leftIndex];
			const right = patches[rightIndex];
			if (
				left &&
				right &&
				pointersOverlap({ left: left.jsonPointer, right: right.jsonPointer })
			) {
				return {
					ok: false,
					code: "PATCH_POINTER_OVERLAP",
					message: `Patches ${left.foreignRef} and ${right.foreignRef} overlap.`,
					foreignRef: right.foreignRef,
				};
			}
		}
	}
	return null;
}

function validateUnknownSubtrees({
	patches,
	unknownSubtrees,
}: {
	patches: readonly SameProfileScalarPatch[];
	unknownSubtrees: readonly UnknownSubtreeOwnership[];
}): ApplySameProfileScalarPatchesResult | null {
	const dirtyDomainsByOwnerId = new Map<string, InteropDirtyDomain[]>();
	for (const patch of patches) {
		const domains = dirtyDomainsByOwnerId.get(patch.ownerSemanticId) ?? [];
		if (!domains.includes(patch.domain)) domains.push(patch.domain);
		dirtyDomainsByOwnerId.set(patch.ownerSemanticId, domains);
	}
	const decisions = evaluateUnknownSubtrees({
		subtrees: unknownSubtrees,
		deletedOwnerIds: new Set<string>(),
		dirtyDomainsByOwnerId,
	});
	for (const subtree of unknownSubtrees) {
		const decision = decisions.get(subtree.foreignRef);
		if (decision === "conflict") {
			return {
				ok: false,
				code: "UNKNOWN_SUBTREE_CONFLICT",
				message: `Unknown subtree ${subtree.foreignRef} conflicts with an edited owner domain.`,
				foreignRef: subtree.foreignRef,
			};
		}
		if (decision === "drop") {
			return {
				ok: false,
				code: "UNKNOWN_SUBTREE_DROP_UNSUPPORTED",
				message: `Unknown subtree ${subtree.foreignRef} requires structural deletion.`,
				foreignRef: subtree.foreignRef,
			};
		}
	}
	return null;
}

export function applySameProfileScalarPatches({
	patches,
	relativePath,
	sourceBytes,
	unknownSubtrees = [],
}: {
	patches: readonly SameProfileScalarPatch[];
	relativePath: string;
	sourceBytes: Uint8Array;
	unknownSubtrees?: readonly UnknownSubtreeOwnership[];
}): ApplySameProfileScalarPatchesResult {
	const patchSetError = validatePatchSet({ patches, relativePath });
	if (patchSetError !== null) return patchSetError;
	const ownershipError = validateUnknownSubtrees({ patches, unknownSubtrees });
	if (ownershipError !== null) return ownershipError;

	let sourceText: string;
	try {
		sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
	} catch {
		return {
			ok: false,
			code: "SOURCE_INVALID_UTF8",
			message: `${relativePath} is not valid UTF-8.`,
		};
	}

	let document: unknown;
	try {
		document = JSON.parse(sourceText);
	} catch {
		return {
			ok: false,
			code: "SOURCE_INVALID_JSON",
			message: `${relativePath} is not valid JSON.`,
		};
	}

	const targets: ResolvedPatchTarget[] = [];
	for (const patch of patches) {
		const resolved = resolvePatchTarget({ document, patch });
		if (!resolved.ok) return resolved;
		const currentValue = readTargetValue({ target: resolved.target });
		if (!isJsonScalar(currentValue)) {
			return {
				ok: false,
				code: "PATCH_TARGET_NOT_SCALAR",
				message: `Patch ${patch.foreignRef} does not target a JSON scalar.`,
				foreignRef: patch.foreignRef,
			};
		}
		if (
			scalarType({ value: currentValue }) !==
				scalarType({ value: patch.expectedValue }) ||
			!scalarEquals({ left: currentValue, right: patch.expectedValue })
		) {
			return {
				ok: false,
				code: "PATCH_PRECONDITION_FAILED",
				message: `Patch ${patch.foreignRef} no longer matches its imported value.`,
				foreignRef: patch.foreignRef,
			};
		}
		targets.push(resolved.target);
	}

	for (const target of targets) setTargetValue({ target });
	return {
		ok: true,
		document,
		outputBytes: new TextEncoder().encode(JSON.stringify(document)),
		appliedForeignRefs: targets.map(({ patch }) => patch.foreignRef),
	};
}
