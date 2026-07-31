const MAX_ARRAY_LENGTH = 100_000;
const MAX_INPUT_DEPTH = 64;
const MAX_INPUT_NODES = 250_000;
const MAX_STRING_LENGTH = 4 * 1024 * 1024;
const MAX_TOTAL_STRING_LENGTH = 16 * 1024 * 1024;
const FORBIDDEN_RECORD_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);

export type JsonValue =
	| boolean
	| null
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface StandaloneJianyingDraftRequestValidationIssue {
	message: string;
	path: string;
}

export class StandaloneJianyingDraftRequestValidationError extends Error {
	readonly issues: readonly StandaloneJianyingDraftRequestValidationIssue[];

	constructor({
		issues,
	}: {
		issues: StandaloneJianyingDraftRequestValidationIssue[];
	}) {
		super(
			`Invalid standalone JianYing export request:\n${issues
				.map(({ message, path }) => `${path}: ${message}`)
				.join("\n")}`
		);
		this.name = "StandaloneJianyingDraftRequestValidationError";
		this.issues = Object.freeze(
			issues.map((issue) => Object.freeze({ ...issue }))
		);
	}
}

interface CloneState {
	activeObjects: WeakSet<object>;
	nodeCount: number;
	totalStringLength: number;
}

export function validationIssue({
	message,
	path,
}: StandaloneJianyingDraftRequestValidationIssue): StandaloneJianyingDraftRequestValidationError {
	return new StandaloneJianyingDraftRequestValidationError({
		issues: [{ message, path }],
	});
}

function assertInputBudget({
	depth,
	state,
}: {
	depth: number;
	state: CloneState;
}): void {
	state.nodeCount += 1;
	if (depth > MAX_INPUT_DEPTH) {
		throw validationIssue({
			message: `Input nesting exceeds ${MAX_INPUT_DEPTH} levels.`,
			path: "$",
		});
	}
	if (state.nodeCount > MAX_INPUT_NODES) {
		throw validationIssue({
			message: `Input contains more than ${MAX_INPUT_NODES} values.`,
			path: "$",
		});
	}
}

function assertStringBudget({
	length,
	path,
	state,
}: {
	length: number;
	path: string;
	state: CloneState;
}): void {
	state.totalStringLength += length;
	if (state.totalStringLength > MAX_TOTAL_STRING_LENGTH) {
		throw validationIssue({
			message: `Input contains more than ${MAX_TOTAL_STRING_LENGTH} total string characters.`,
			path,
		});
	}
}

function cloneJsonValueAtPath({
	depth,
	path,
	state,
	value,
}: {
	depth: number;
	path: string;
	state: CloneState;
	value: unknown;
}): JsonValue {
	assertInputBudget({ depth, state });
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
			throw validationIssue({
				message: `String exceeds ${MAX_STRING_LENGTH} characters.`,
				path,
			});
		}
		if (typeof value === "string") {
			assertStringBudget({ length: value.length, path, state });
		}
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw validationIssue({
				message: "Numbers must be finite.",
				path,
			});
		}
		return value;
	}
	if (typeof value !== "object") {
		throw validationIssue({
			message: "Value must be JSON-compatible.",
			path,
		});
	}
	if (state.activeObjects.has(value)) {
		throw validationIssue({
			message: "Cyclic references are not allowed.",
			path,
		});
	}
	state.activeObjects.add(value);
	try {
		if (Array.isArray(value)) {
			if (value.length > MAX_ARRAY_LENGTH) {
				throw validationIssue({
					message: `Array exceeds ${MAX_ARRAY_LENGTH} entries.`,
					path,
				});
			}
			return value.map((entry, index) =>
				cloneJsonValueAtPath({
					depth: depth + 1,
					path: `${path}[${index}]`,
					state,
					value: entry,
				})
			);
		}

		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw validationIssue({
				message: "Objects must have a plain-object prototype.",
				path,
			});
		}
		if (Object.getOwnPropertySymbols(value).length > 0) {
			throw validationIssue({
				message: "Symbol properties are not allowed.",
				path,
			});
		}
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const cloned: { [key: string]: JsonValue } = {};
		for (const key of Object.keys(descriptors).sort()) {
			if (key.length > MAX_STRING_LENGTH) {
				throw validationIssue({
					message: `Property name exceeds ${MAX_STRING_LENGTH} characters.`,
					path,
				});
			}
			assertStringBudget({
				length: key.length,
				path,
				state,
			});
			if (FORBIDDEN_RECORD_KEYS.has(key)) {
				throw validationIssue({
					message: `Property ${JSON.stringify(key)} is not allowed.`,
					path: `${path}.${key}`,
				});
			}
			const descriptor = descriptors[key];
			if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
				throw validationIssue({
					message: "Only enumerable data properties are allowed.",
					path: `${path}.${key}`,
				});
			}
			cloned[key] = cloneJsonValueAtPath({
				depth: depth + 1,
				path: `${path}.${key}`,
				state,
				value: descriptor.value,
			});
		}
		return cloned;
	} finally {
		state.activeObjects.delete(value);
	}
}

export function cloneJsonValue({ value }: { value: unknown }): JsonValue {
	return cloneJsonValueAtPath({
		depth: 0,
		path: "$",
		state: {
			activeObjects: new WeakSet(),
			nodeCount: 0,
			totalStringLength: 0,
		},
		value,
	});
}

export function getRecord({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): { [key: string]: JsonValue } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw validationIssue({ message: "Expected an object.", path });
	}
	return value;
}

export function getArray({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): JsonValue[] {
	if (!Array.isArray(value)) {
		throw validationIssue({ message: "Expected an array.", path });
	}
	return value;
}

export function getString({
	allowEmpty = false,
	path,
	value,
}: {
	allowEmpty?: boolean;
	path: string;
	value: JsonValue | undefined;
}): string {
	if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
		throw validationIssue({
			message: allowEmpty
				? "Expected a string."
				: "Expected a non-empty string.",
			path,
		});
	}
	if (value.includes("\0")) {
		throw validationIssue({
			message: "NUL characters are not allowed.",
			path,
		});
	}
	return value;
}

export function getFiniteNumber({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw validationIssue({ message: "Expected a finite number.", path });
	}
	return value;
}

export function getBoolean({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): boolean {
	if (typeof value !== "boolean") {
		throw validationIssue({ message: "Expected a boolean.", path });
	}
	return value;
}

export function assertOptionalFiniteNumber({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value !== undefined) getFiniteNumber({ path, value });
}

export function assertOptionalBoolean({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value !== undefined) getBoolean({ path, value });
}

export function assertStringLiteral({
	allowed,
	path,
	value,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): string {
	const literal = getString({ path, value });
	if (!allowed.has(literal)) {
		throw validationIssue({
			message: `Expected one of: ${[...allowed].join(", ")}.`,
			path,
		});
	}
	return literal;
}

export function assertNoUnknownKeys({
	allowed,
	path,
	record,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	record: { [key: string]: JsonValue };
}): void {
	const unknownKeys = Object.keys(record).filter((key) => !allowed.has(key));
	if (unknownKeys.length > 0) {
		throw validationIssue({
			message: `Unknown properties: ${unknownKeys.join(", ")}.`,
			path,
		});
	}
}

export function deepFreeze<T>({ value }: { value: T }): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const nestedValue of Object.values(value)) {
		deepFreeze({ value: nestedValue });
	}
	return Object.freeze(value);
}
