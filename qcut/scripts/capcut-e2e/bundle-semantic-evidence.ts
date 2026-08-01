import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type DissolveSemanticEvidence,
	verifyDissolveSemantics,
} from "./bundle-semantic-dissolve.js";
import {
	type JsonRecord,
	requireExactValue,
	requireRecord,
	requireSingle,
} from "./bundle-semantic-json.js";
import {
	type LutMaskSemanticEvidence,
	verifyLutMaskSemantics,
} from "./bundle-semantic-lut-mask.js";
import {
	type NativeSemanticEvidence,
	verifyNativeSemantics,
} from "./bundle-semantic-native.js";
import type { MigrationCaseId } from "./migration-case-builder.js";

const TIMELINE_DURATION_US = 6_000_000;

export type BundleSemanticEvidence =
	| DissolveSemanticEvidence
	| LutMaskSemanticEvidence
	| NativeSemanticEvidence;

function parseContent({ contentText }: { contentText: string }): JsonRecord {
	const parsed: unknown = JSON.parse(contentText);
	const content = requireRecord({
		label: "CapCut draft content",
		value: parsed,
	});
	requireExactValue({
		actual: content.duration,
		expected: TIMELINE_DURATION_US,
		label: "CapCut draft duration",
	});
	return content;
}

export function verifyBundleCaseSemantics({
	caseId,
	contentText,
	generatedLutText,
}: {
	caseId: MigrationCaseId;
	contentText: string;
	generatedLutText?: string;
}): BundleSemanticEvidence {
	const content = parseContent({ contentText });
	if (caseId === "native-text-sticker") {
		return verifyNativeSemantics({ content });
	}
	if (caseId === "dissolve") return verifyDissolveSemantics({ content });
	if (generatedLutText === undefined) {
		throw new Error("LUT/mask case is missing its generated .cube evidence.");
	}
	return verifyLutMaskSemantics({ content, lutText: generatedLutText });
}

export async function verifyWrittenBundleCaseSemantics({
	caseId,
	contentText,
	draftDirectory,
	generatedAssets,
}: {
	caseId: MigrationCaseId;
	contentText: string;
	draftDirectory: string;
	generatedAssets: readonly { kind: string; relativePath: string }[];
}): Promise<BundleSemanticEvidence> {
	if (caseId !== "lut-mask") {
		return verifyBundleCaseSemantics({ caseId, contentText });
	}
	const generatedLut = requireSingle({
		label: "Generated LUT asset",
		values: generatedAssets.filter(({ kind }) => kind === "generated-lut"),
	});
	const generatedLutText = await readFile(
		join(draftDirectory, generatedLut.relativePath),
		"utf8"
	);
	return verifyBundleCaseSemantics({
		caseId,
		contentText,
		generatedLutText,
	});
}
