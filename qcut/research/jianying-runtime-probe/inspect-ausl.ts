import { readFileSync } from "node:fs";
import path from "node:path";

import { parseAuslContainer } from "./ausl-container";

const inputPaths = process.argv
	.slice(2)
	.map((inputPath) => path.resolve(inputPath));
if (inputPaths.length === 0) {
	throw new Error("usage: bun inspect-ausl.ts file.ausl ...");
}

const results = inputPaths.map((inputPath) => {
	const container = parseAuslContainer({ bytes: readFileSync(inputPath) });
	return {
		file: inputPath,
		reserved: container.reserved,
		decodedByteLength: container.decodedByteLength,
		ciphertextByteLength: container.ciphertextByteLength,
		paddingByteLength: container.paddingByteLength,
	};
});

console.log(
	JSON.stringify(results.length === 1 ? results[0] : results, null, 2)
);
