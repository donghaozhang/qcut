import { CAPCUT_8_1_APP_VERSION } from "./capcut-8-1-profile.js";
import type { JianyingDraftTargetPlatform } from "./types.js";

export const CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY = "system" as const;
export const CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS = "Arial" as const;

export const CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS = {
	materialFontFields: "omit",
	styleFontField: "omit",
} as const;

export const CAPCUT_8_1_VERIFIED_HAN_RANGES = [
	"U+3400-U+4DB5",
	"U+4E00-U+9FD0",
] as const;

export interface CapCut81FontRun {
	end: number;
	family: string;
	start: number;
}

export interface ResolveCapCut81FontOptions {
	appVersion: string;
	content: string;
	fontRuns?: readonly CapCut81FontRun[];
	requestedFamily?: string;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface CapCut81FontResolutionWarning {
	code: "CAPCUT_FONT_FAMILY_SUBSTITUTED";
	message: string;
	requestedFamily: string;
	resolvedFamily: typeof CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY;
	severity: "warning";
}

export interface CapCut81FontResolutionError {
	code:
		| "UNSUPPORTED_CAPCUT_FONT_PLATFORM"
		| "UNSUPPORTED_CAPCUT_FONT_VERSION"
		| "UNVERIFIED_CAPCUT_EMOJI_FONT"
		| "UNVERIFIED_CAPCUT_EXPLICIT_FONT"
		| "UNVERIFIED_CAPCUT_FONT_RUNS"
		| "UNVERIFIED_CAPCUT_TEXT_SCRIPT";
	message: string;
	severity: "error";
}

export interface CapCut81SystemDefaultFontResolution {
	appVersion: typeof CAPCUT_8_1_APP_VERSION;
	coverage: {
		emoji: false;
		systemFallbackAllowlist: readonly [
			"latin",
			"verified-bmp-han",
			"common",
			"inherited",
		];
		verifiedHanRanges: typeof CAPCUT_8_1_VERIFIED_HAN_RANGES;
		verifiedScripts: readonly ["latin", "simplified-chinese"];
	};
	draftFields: typeof CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS;
	kind: "system-default";
	ok: true;
	requestedFamily: string | null;
	resolvedFamily: typeof CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY;
	targetPlatform: "macos";
	warnings: readonly CapCut81FontResolutionWarning[];
}

export interface CapCut81UnsupportedFontResolution {
	errors: readonly CapCut81FontResolutionError[];
	kind: "unsupported";
	ok: false;
}

export type CapCut81FontResolution =
	| CapCut81SystemDefaultFontResolution
	| CapCut81UnsupportedFontResolution;

const EMOJI_CONTENT_PATTERN =
	/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3|\ufe0f)/u;
const SYSTEM_FALLBACK_NON_HAN_PATTERN =
	/^(?:\p{Script=Latin}|\p{Script=Common}|\p{Script=Inherited})$/u;

function isVerifiedBmpHan({ character }: { character: string }): boolean {
	const codePoint = character.codePointAt(0);
	if (codePoint === undefined) return false;
	return (
		(codePoint >= 0x3400 && codePoint <= 0x4db5) ||
		(codePoint >= 0x4e00 && codePoint <= 0x9fd0)
	);
}

function createResolutionError({
	code,
	message,
}: Pick<
	CapCut81FontResolutionError,
	"code" | "message"
>): CapCut81FontResolutionError {
	return { code, message, severity: "error" };
}

function normalizedFamily({ family }: { family?: string }): string {
	return family?.trim() ?? "";
}

function isSystemDefaultFamily({ family }: { family: string }): boolean {
	return (
		family.length === 0 ||
		family.toLowerCase() === CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY
	);
}

function isLegacyDefaultAlias({ family }: { family: string }): boolean {
	return (
		family.toLowerCase() === CAPCUT_8_1_LEGACY_DEFAULT_FONT_ALIAS.toLowerCase()
	);
}

function findFirstUnverifiedScriptCharacter({
	content,
}: {
	content: string;
}): string | null {
	for (const character of content) {
		if (
			!SYSTEM_FALLBACK_NON_HAN_PATTERN.test(character) &&
			!isVerifiedBmpHan({ character })
		) {
			return character;
		}
	}
	return null;
}

function formatUnicodeCodePoint({ character }: { character: string }): string {
	const codePoint = character.codePointAt(0);
	if (codePoint === undefined) {
		throw new Error("Expected a non-empty Unicode character.");
	}
	return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function collectBlockingErrors({
	appVersion,
	content,
	fontRuns,
	requestedFamily,
	targetPlatform,
}: {
	appVersion: string;
	content: string;
	fontRuns: readonly CapCut81FontRun[];
	requestedFamily: string;
	targetPlatform: JianyingDraftTargetPlatform;
}): CapCut81FontResolutionError[] {
	const errors: CapCut81FontResolutionError[] = [];
	const unverifiedScriptCharacter = findFirstUnverifiedScriptCharacter({
		content,
	});
	if (targetPlatform !== "macos") {
		errors.push(
			createResolutionError({
				code: "UNSUPPORTED_CAPCUT_FONT_PLATFORM",
				message:
					"CapCut 8.1 system-default font behavior is verified only on macOS.",
			})
		);
	}
	if (appVersion !== CAPCUT_8_1_APP_VERSION) {
		errors.push(
			createResolutionError({
				code: "UNSUPPORTED_CAPCUT_FONT_VERSION",
				message: `CapCut font behavior is verified only for version ${CAPCUT_8_1_APP_VERSION}.`,
			})
		);
	}
	if (fontRuns.length > 0) {
		errors.push(
			createResolutionError({
				code: "UNVERIFIED_CAPCUT_FONT_RUNS",
				message:
					"Per-range and multi-font text have no verified CapCut 8.1 reference draft.",
			})
		);
	}
	if (EMOJI_CONTENT_PATTERN.test(content)) {
		errors.push(
			createResolutionError({
				code: "UNVERIFIED_CAPCUT_EMOJI_FONT",
				message: "Emoji fallback has no verified CapCut 8.1 reference draft.",
			})
		);
	}
	if (unverifiedScriptCharacter !== null) {
		errors.push(
			createResolutionError({
				code: "UNVERIFIED_CAPCUT_TEXT_SCRIPT",
				message: `Character ${JSON.stringify(unverifiedScriptCharacter)} (${formatUnicodeCodePoint({ character: unverifiedScriptCharacter })}) is outside the conservative CapCut 8.1 system-fallback allowlist (Latin, Common, Inherited, and the verified Han ranges ${CAPCUT_8_1_VERIFIED_HAN_RANGES.join(", ")}).`,
			})
		);
	}
	if (
		!isSystemDefaultFamily({ family: requestedFamily }) &&
		!isLegacyDefaultAlias({ family: requestedFamily })
	) {
		errors.push(
			createResolutionError({
				code: "UNVERIFIED_CAPCUT_EXPLICIT_FONT",
				message: `Font family ${requestedFamily} has no verified CapCut 8.1 mapping.`,
			})
		);
	}
	return errors;
}

function createSubstitutionWarning({
	requestedFamily,
}: {
	requestedFamily: string;
}): CapCut81FontResolutionWarning {
	return {
		code: "CAPCUT_FONT_FAMILY_SUBSTITUTED",
		message:
			"Arial is not preserved by the verified CapCut 8.1 export path; CapCut substitutes its system-default font stack.",
		requestedFamily,
		resolvedFamily: CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY,
		severity: "warning",
	};
}

export function resolveCapCut81Font({
	appVersion,
	content,
	fontRuns = [],
	requestedFamily,
	targetPlatform,
}: ResolveCapCut81FontOptions): CapCut81FontResolution {
	const requested = normalizedFamily({ family: requestedFamily });
	const errors = collectBlockingErrors({
		appVersion,
		content,
		fontRuns,
		requestedFamily: requested,
		targetPlatform,
	});
	if (errors.length > 0) {
		return { errors, kind: "unsupported", ok: false };
	}

	const warnings = isLegacyDefaultAlias({ family: requested })
		? [createSubstitutionWarning({ requestedFamily: requested })]
		: [];
	return {
		appVersion: CAPCUT_8_1_APP_VERSION,
		coverage: {
			emoji: false,
			systemFallbackAllowlist: [
				"latin",
				"verified-bmp-han",
				"common",
				"inherited",
			],
			verifiedHanRanges: CAPCUT_8_1_VERIFIED_HAN_RANGES,
			verifiedScripts: ["latin", "simplified-chinese"],
		},
		draftFields: CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS,
		kind: "system-default",
		ok: true,
		requestedFamily: requested || null,
		resolvedFamily: CAPCUT_8_1_SYSTEM_DEFAULT_FONT_FAMILY,
		targetPlatform: "macos",
		warnings,
	};
}
