function hashString({ input, seed }: { input: string; seed: number }): number {
	let hash = seed >>> 0;
	for (const character of input) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function toHexWord({ value }: { value: number }): string {
	return value.toString(16).padStart(8, "0");
}

export function createDeterministicJianyingId({
	namespace,
	sourceId,
}: {
	namespace: string;
	sourceId: string;
}): string {
	const input = `${namespace}:${sourceId}`;
	const hex = [
		hashString({ input, seed: 0x811c9dc5 }),
		hashString({ input, seed: 0x9e3779b9 }),
		hashString({ input, seed: 0x85ebca6b }),
		hashString({ input, seed: 0xc2b2ae35 }),
	]
		.map((value) => toHexWord({ value }))
		.join("");

	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20),
	].join("-");
}
