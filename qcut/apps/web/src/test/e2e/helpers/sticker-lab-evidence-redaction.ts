const PRIVATE_CACHE_MARKER = "<private-sticker-cache>";
const REAL_VIDEO_MARKER = "<real-test-video>";
const PRIVATE_USER_PATH_PATTERNS = [
	/\/Users\/[^/"\\]+/,
	/\/home\/[^/"\\]+/,
	/[A-Za-z]:(?:\\\\|\/)Users(?:\\\\|\/)[^/"\\]+/,
];

interface EvidenceReplacement {
	replacement: string;
	source: string;
}

function replaceEvidenceStrings({
	replacements,
	value,
}: {
	replacements: EvidenceReplacement[];
	value: unknown;
}): unknown {
	if (typeof value === "string") {
		let redacted = value;
		for (const { replacement, source } of replacements) {
			if (source.length === 0) continue;
			redacted = redacted.split(source).join(replacement);
		}
		return redacted;
	}
	if (Array.isArray(value)) {
		return value.map((item) =>
			replaceEvidenceStrings({ replacements, value: item })
		);
	}
	if (!(value && typeof value === "object")) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			replaceEvidenceStrings({ replacements, value: item }),
		])
	);
}

export function redactStickerLabEvidence({
	cacheRootPath,
	inputVideoPath,
	value,
}: {
	cacheRootPath: string;
	inputVideoPath: string;
	value: unknown;
}): unknown {
	const redacted = replaceEvidenceStrings({
		replacements: [
			{ replacement: PRIVATE_CACHE_MARKER, source: cacheRootPath },
			{ replacement: REAL_VIDEO_MARKER, source: inputVideoPath },
		],
		value,
	});
	const serialized = JSON.stringify(redacted);
	if (PRIVATE_USER_PATH_PATTERNS.some((pattern) => pattern.test(serialized))) {
		throw new Error("Sticker Lab evidence contains a private user path");
	}
	return redacted;
}
