import { readFileSync } from "node:fs";
import path from "node:path";

import { parseSerializedContainer } from "./serialized-container";
import {
	collectSerializedHashes,
	findDjb2Names,
} from "./serialized-name-dictionary";
import {
	createSerializedNameResolver,
	parseSerializedValue,
	type SerializedNameResolver,
} from "./serialized-value";

type InspectOptions = {
	dictionaryBinary: string | null;
	inputPaths: string[];
	summary: boolean;
};

function parseArguments({ args }: { args: string[] }): InspectOptions {
	const inputPaths: string[] = [];
	let dictionaryBinary: string | null = null;
	let summary = false;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--dictionary-binary") {
			const value = args[index + 1];
			if (!value) {
				throw new Error("--dictionary-binary requires a path");
			}
			dictionaryBinary = path.resolve(value);
			index += 1;
			continue;
		}
		if (argument === "--summary") {
			summary = true;
			continue;
		}
		if (argument?.startsWith("--")) {
			throw new Error(`unknown option: ${argument}`);
		}
		if (argument) {
			inputPaths.push(path.resolve(argument));
		}
	}
	if (inputPaths.length === 0) {
		throw new Error(
			"usage: bun inspect-serialized.ts [--dictionary-binary dylib] [--summary] file ..."
		);
	}
	return { dictionaryBinary, inputPaths, summary };
}

function decodeRecords({
	inputPath,
	resolveNames,
}: {
	inputPath: string;
	resolveNames: SerializedNameResolver;
}) {
	const container = parseSerializedContainer({
		bytes: readFileSync(inputPath),
	});
	const records = container.records.map((record, index) => {
		const value = parseSerializedValue({
			bytes: record.payload,
			resolveNames,
			formatVersion: container.version,
		});
		if (value.typeHash !== record.typeHash) {
			throw new Error(
				`record ${index} directory type 0x${record.typeHash.toString(16)} does not match payload type 0x${value.typeHash.toString(16)}`
			);
		}
		return { record, value };
	});
	return { container, records };
}

function inspectFile({
	inputPath,
	resolveNames,
	summary,
}: {
	inputPath: string;
	resolveNames: SerializedNameResolver;
	summary: boolean;
}) {
	const decoded = decodeRecords({ inputPath, resolveNames });
	const recordTypes = new Map<
		string,
		{
			typeHash: string;
			typeNames: string[];
			recordCount: number;
			payloadBytes: number;
		}
	>();
	for (const { record, value } of decoded.records) {
		const typeHash = `0x${record.typeHash.toString(16).padStart(8, "0")}`;
		const aggregate = recordTypes.get(typeHash) ?? {
			typeHash,
			typeNames: value.typeNames,
			recordCount: 0,
			payloadBytes: 0,
		};
		aggregate.recordCount += 1;
		aggregate.payloadBytes += record.byteLength;
		recordTypes.set(typeHash, aggregate);
	}

	return {
		file: inputPath,
		version: decoded.container.version,
		additionalDirectoryBytes: decoded.container.additionalDirectoryBytes,
		payloadOffset: decoded.container.payloadOffset,
		recordCount: decoded.records.length,
		...(summary
			? { recordTypes: [...recordTypes.values()] }
			: {
					records: decoded.records.map(({ record, value }) => ({
						localId: record.localId,
						typeHash: `0x${record.typeHash.toString(16).padStart(8, "0")}`,
						typeNames: value.typeNames,
						byteLength: record.byteLength,
						payloadOffset: record.payloadOffset,
						value,
					})),
				}),
	};
}

const options = parseArguments({ args: process.argv.slice(2) });
const initialRecords = options.inputPaths.flatMap((inputPath) =>
	decodeRecords({
		inputPath,
		resolveNames: createSerializedNameResolver(),
	}).records.map(({ value }) => value)
);
let resolveNames = createSerializedNameResolver();
if (options.dictionaryBinary) {
	const targetHashes = collectSerializedHashes({ values: initialRecords });
	const matches = findDjb2Names({
		bytes: readFileSync(options.dictionaryBinary),
		targetHashes,
	});
	resolveNames = createSerializedNameResolver({
		names: [...matches.values()].flat(),
	});
}
const results = options.inputPaths.map((inputPath) =>
	inspectFile({
		inputPath,
		resolveNames,
		summary: options.summary,
	})
);
console.log(
	JSON.stringify(results.length === 1 ? results[0] : results, null, 2)
);
