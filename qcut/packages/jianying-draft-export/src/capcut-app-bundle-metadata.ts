export const CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER =
	"com.lemon.lvoverseas" as const;

export interface CapCutBundleMetadata {
	bundleIdentifier: string;
	bundleVersion: string;
	shortVersion: string;
}

function decodeXmlText({ value }: { value: string }): string {
	const decoded = value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
	if (/&[^;]+;/.test(decoded)) {
		throw new Error("CapCut Info.plist contains an unsupported XML entity.");
	}
	return decoded;
}

function readPlistString({ key, text }: { key: string; text: string }): string {
	const match = new RegExp(
		`<key>\\s*${key}\\s*</key>\\s*<string>([^<]*)</string>`
	).exec(text);
	if (!match?.[1]) {
		throw new Error(`CapCut Info.plist is missing ${key}.`);
	}
	return decodeXmlText({ value: match[1] });
}

export function parseCapCutBundleMetadata({
	infoPlistText,
}: {
	infoPlistText: string;
}): CapCutBundleMetadata {
	if (
		!infoPlistText.trimStart().startsWith("<?xml") ||
		!infoPlistText.includes("<plist")
	) {
		throw new Error("CapCut Info.plist must use the verified XML format.");
	}
	return {
		bundleIdentifier: readPlistString({
			key: "CFBundleIdentifier",
			text: infoPlistText,
		}),
		bundleVersion: readPlistString({
			key: "CFBundleVersion",
			text: infoPlistText,
		}),
		shortVersion: readPlistString({
			key: "CFBundleShortVersionString",
			text: infoPlistText,
		}),
	};
}
