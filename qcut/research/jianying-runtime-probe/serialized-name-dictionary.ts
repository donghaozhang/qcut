import { djb2NameHash } from "./serialized-container";
import type { SerializedValue } from "./serialized-value";

function collectValueHashes({
	value,
	hashes,
}: {
	value: SerializedValue;
	hashes: Set<number>;
}) {
	hashes.add(value.typeHash);
	if (value.kind === "external-ref") {
		hashes.add(value.targetTypeHash);
		return;
	}
	if (value.kind === "object") {
		for (const field of value.fields) {
			hashes.add(field.nameHash);
			collectValueHashes({ value: field.value, hashes });
		}
		return;
	}
	if (value.kind === "vector") {
		for (const child of value.values) {
			collectValueHashes({ value: child, hashes });
		}
		return;
	}
	if (value.kind === "map") {
		for (const entry of value.entries) {
			collectValueHashes({ value: entry.value, hashes });
		}
	}
}

export function collectSerializedHashes({
	values,
}: {
	values: Iterable<SerializedValue>;
}) {
	const hashes = new Set<number>();
	for (const value of values) {
		collectValueHashes({ value, hashes });
	}
	return hashes;
}

export function findDjb2Names({
	bytes,
	targetHashes,
	maximumNameBytes = 128,
	minimumNameBytes = 1,
}: {
	bytes: Uint8Array;
	targetHashes: ReadonlySet<number>;
	maximumNameBytes?: number;
	minimumNameBytes?: number;
}) {
	if (minimumNameBytes < 1 || maximumNameBytes < minimumNameBytes) {
		throw new Error("invalid printable-name length range");
	}

	const matches = new Map<number, Set<string>>();
	let start = -1;
	for (let index = 0; index <= bytes.byteLength; index += 1) {
		const byte = bytes[index];
		const isPrintableAscii = byte !== undefined && byte >= 0x20 && byte <= 0x7e;
		if (isPrintableAscii) {
			if (start === -1) {
				start = index;
			}
			continue;
		}

		if (start === -1) {
			continue;
		}
		const byteLength = index - start;
		if (byteLength >= minimumNameBytes && byteLength <= maximumNameBytes) {
			const name = new TextDecoder().decode(bytes.subarray(start, index));
			const hash = djb2NameHash({ name });
			if (targetHashes.has(hash)) {
				const names = matches.get(hash) ?? new Set<string>();
				names.add(name);
				matches.set(hash, names);
			}
		}
		start = -1;
	}

	return new Map(
		[...matches].map(([hash, names]) => [hash, [...names].sort()] as const)
	);
}
