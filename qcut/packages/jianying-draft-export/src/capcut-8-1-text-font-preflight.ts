import { resolveSubtitleStyle } from "@qcut/editor-core";
import {
	CAPCUT_8_1_APP_VERSION,
	resolveCapCut81Font,
	type JianyingDraftIssue,
	type JianyingDraftTargetPlatform,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import {
	CapCut81FontStackInspectionError,
	inspectCapCut81SystemFontStack,
	type CapCut81FontGlyphCoverageInspector,
	type CapCut81SystemFontStackEvidence,
} from "./capcut-8-1-system-font-stack.js";

interface CapCut81ExportableTextTarget {
	content: string;
	elementId: string;
	fontFamily: string;
	trackId: string;
}

export interface CollectCapCut81RuntimeFontIssuesOptions {
	capCutAppPath?: string;
	inspectGlyphCoverage?: CapCut81FontGlyphCoverageInspector;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

function collectExportableTextTargets({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): CapCut81ExportableTextTarget[] {
	const targets: CapCut81ExportableTextTarget[] = [];
	for (const track of snapshot.tracks) {
		if (track.hidden) continue;
		for (const element of track.elements) {
			if (element.hidden) continue;
			if (track.type === "text" && element.type === "text") {
				if (element.content.trim().length === 0) continue;
				targets.push({
					content: element.content,
					elementId: element.id,
					fontFamily: element.fontFamily,
					trackId: track.id,
				});
				continue;
			}
			if (track.type !== "captions" || element.type !== "captions") continue;
			if (element.text.trim().length === 0) continue;
			targets.push({
				content: element.text,
				elementId: element.id,
				fontFamily: resolveSubtitleStyle(element.style).fontFamily,
				trackId: track.id,
			});
		}
	}
	return targets;
}

function acceptsSystemFontStack({
	target,
	targetPlatform,
}: {
	target: CapCut81ExportableTextTarget;
	targetPlatform: JianyingDraftTargetPlatform;
}): boolean {
	return resolveCapCut81Font({
		appVersion: CAPCUT_8_1_APP_VERSION,
		content: target.content,
		requestedFamily: target.fontFamily,
		targetPlatform,
	}).ok;
}

function createTargetIssue({
	code,
	message,
	target,
}: {
	code: string;
	message: string;
	target: CapCut81ExportableTextTarget;
}): JianyingDraftIssue {
	return {
		code,
		elementId: target.elementId,
		message,
		severity: "error",
		trackId: target.trackId,
	};
}

function createEvidenceIssue({
	evidence,
}: {
	evidence: CapCut81SystemFontStackEvidence;
}): JianyingDraftIssue {
	return {
		code: "CAPCUT_8_1_FONT_STACK_VERIFIED",
		message: `CapCut 8.1.1 system font stack evidence: ${JSON.stringify(evidence)}`,
		severity: "info",
	};
}

function collectMissingGlyphsForTarget({
	missingCodePoints,
	target,
}: {
	missingCodePoints: ReadonlySet<number>;
	target: CapCut81ExportableTextTarget;
}): Array<{ character: string; unicode: string }> {
	const seen = new Set<number>();
	return Array.from(target.content).flatMap((character) => {
		const codePoint = character.codePointAt(0);
		if (
			codePoint === undefined ||
			seen.has(codePoint) ||
			!missingCodePoints.has(codePoint)
		) {
			return [];
		}
		seen.add(codePoint);
		return [
			{
				character,
				unicode: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
			},
		];
	});
}

export async function collectCapCut81RuntimeFontIssues({
	capCutAppPath,
	inspectGlyphCoverage,
	snapshot,
	targetPlatform,
}: CollectCapCut81RuntimeFontIssuesOptions): Promise<JianyingDraftIssue[]> {
	const targets = collectExportableTextTargets({ snapshot }).filter((target) =>
		acceptsSystemFontStack({ target, targetPlatform })
	);
	if (targets.length === 0) return [];
	if (!capCutAppPath) {
		return targets.map((target) =>
			createTargetIssue({
				code: "CAPCUT_8_1_FONT_APP_PATH_REQUIRED",
				message:
					"CapCut 8.1.1 text export requires a trusted main-process application path for runtime glyph preflight.",
				target,
			})
		);
	}

	let inspection;
	try {
		inspection = await inspectCapCut81SystemFontStack({
			capCutAppPath,
			...(inspectGlyphCoverage === undefined ? {} : { inspectGlyphCoverage }),
			text: targets.map(({ content }) => content).join(""),
		});
	} catch (error) {
		const code =
			error instanceof CapCut81FontStackInspectionError
				? error.code
				: "CAPCUT_8_1_SYSTEM_FONT_INVALID";
		const detail = error instanceof Error ? error.message : String(error);
		return targets.map((target) =>
			createTargetIssue({
				code,
				message: `CapCut 8.1.1 runtime font preflight failed: ${detail}`,
				target,
			})
		);
	}

	const issues: JianyingDraftIssue[] = [
		createEvidenceIssue({ evidence: inspection.evidence }),
	];
	const missingCodePoints = new Set(
		inspection.missing.map(({ codePoint }) => codePoint)
	);
	for (const target of targets) {
		const missing = collectMissingGlyphsForTarget({
			missingCodePoints,
			target,
		});
		if (missing.length === 0) continue;
		issues.push(
			createTargetIssue({
				code: "CAPCUT_8_1_FONT_GLYPH_MISSING",
				message: `CapCut 8.1.1 system fonts en.ttf and zh-hans.ttf both lack: ${missing
					.map(
						({ character, unicode }) =>
							`${JSON.stringify(character)} (${unicode})`
					)
					.join(", ")}.`,
				target,
			})
		);
	}
	return issues;
}
