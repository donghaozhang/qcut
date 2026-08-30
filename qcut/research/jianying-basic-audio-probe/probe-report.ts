#!/usr/bin/env bun

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { inventoryDraftRoot } from "../../.agents/skills/qcut-toolkit/jianying-draft-binary-reference/scripts/draft-evidence";
import {
	AUDIO_BASIC_CAPABILITIES,
	AUDIO_MATERIAL_COLLECTIONS,
} from "./capabilities";
import { type AudioDraftSamples, scanAudioDraftSamples } from "./draft-samples";
import {
	assessCapabilityStaticEvidence,
	scanStaticMarkers,
	type StaticMarkerMatches,
} from "./static-markers";

const execFileAsync = promisify(execFile);
const DEFAULT_APP_PATH = "/Applications/VideoFusion-macOS.app";
const DEFAULT_DRAFT_ROOT = path.join(
	process.env.HOME ?? "",
	"Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
);

interface AppMetadata {
	buildVersion: string;
	bundleIdentifier: string;
	version: string;
}

interface ProbeCliOptions {
	appPath: string;
	draftRoot: string;
}

interface ProbeInventorySummary {
	candidateCount: number;
	jsonCount: number;
	lockedProjectCount: number;
	materialCollections: Record<string, number>;
	opaqueCount: number;
	timelineDocumentCount: number;
}

function stringProperty({
	key,
	value,
}: {
	key: string;
	value: Record<string, unknown>;
}): string {
	const property = value[key];
	if (typeof property !== "string" || property.length === 0) {
		throw new Error(`Jianying Info.plist is missing ${key}.`);
	}
	return property;
}

async function readAppMetadata({
	appPath,
}: {
	appPath: string;
}): Promise<AppMetadata> {
	const infoPlistPath = path.join(appPath, "Contents/Info.plist");
	if (!existsSync(infoPlistPath)) {
		throw new Error("The Jianying application Info.plist was not found.");
	}
	const { stdout } = await execFileAsync(
		"plutil",
		["-convert", "json", "-o", "-", infoPlistPath],
		{ maxBuffer: 1024 * 1024 }
	);
	const parsed: unknown = JSON.parse(stdout);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("The Jianying application Info.plist is not an object.");
	}
	const value = parsed as Record<string, unknown>;
	return {
		buildVersion: stringProperty({ key: "CFBundleVersion", value }),
		bundleIdentifier: stringProperty({ key: "CFBundleIdentifier", value }),
		version: stringProperty({ key: "CFBundleShortVersionString", value }),
	};
}

function activeDraftStatus({
	activeMaterialObjects,
	activeSegments,
	materialObjects,
	segmentsWithFields,
}: AudioDraftSamples[keyof AudioDraftSamples]):
	| "active-observed"
	| "default-only"
	| "not-observed" {
	if (activeMaterialObjects + activeSegments > 0) return "active-observed";
	if (materialObjects + segmentsWithFields > 0) return "default-only";
	return "not-observed";
}

export function buildAudioProbeReport({
	app,
	draftSamples,
	inventory,
	staticMatches,
}: {
	app: AppMetadata;
	draftSamples: AudioDraftSamples;
	inventory: ProbeInventorySummary;
	staticMatches: StaticMarkerMatches;
}) {
	return {
		app,
		capabilities: AUDIO_BASIC_CAPABILITIES.map((capability) => ({
			draftEvidence: {
				...draftSamples[capability.id],
				status: activeDraftStatus(draftSamples[capability.id]),
			},
			draftLocations: {
				collections: capability.draftCollections,
				segmentFields: capability.segmentFields,
			},
			id: capability.id,
			labelEn: capability.labelEn,
			labelZh: capability.labelZh,
			staticEvidence: assessCapabilityStaticEvidence({
				capability,
				matches: staticMatches,
			}),
		})),
		drafts: {
			candidateCount: inventory.candidateCount,
			jsonCount: inventory.jsonCount,
			lockedProjectCount: inventory.lockedProjectCount,
			materialCollections: Object.fromEntries(
				AUDIO_MATERIAL_COLLECTIONS.map((collection) => [
					collection,
					inventory.materialCollections[collection] ?? 0,
				])
			),
			opaqueCount: inventory.opaqueCount,
			timelineDocumentCount: inventory.timelineDocumentCount,
		},
		safety: {
			includesFilesystemPaths: false,
			modifiesDrafts: false,
		},
		schema: "qcut.jianying-basic-audio-probe",
		schemaVersion: 1,
	};
}

export async function collectAudioProbeReport({
	appPath,
	draftRoot,
}: ProbeCliOptions) {
	const videoEditorBinaryPath = path.join(
		appPath,
		"Contents/Frameworks/libvideoeditor.dylib"
	);
	const creatorBinaryPath = path.join(
		appPath,
		"Contents/Frameworks/libVECreator.dylib"
	);
	if (!(existsSync(videoEditorBinaryPath) && existsSync(creatorBinaryPath))) {
		throw new Error("The Jianying audio runtime binaries were not found.");
	}

	const appPromise = readAppMetadata({ appPath });
	const staticMatchesPromise = scanStaticMarkers({
		creatorBinaryPath,
		videoEditorBinaryPath,
	});
	const inventory = inventoryDraftRoot({ rootPath: draftRoot });
	const draftSamples = scanAudioDraftSamples({ rootPath: draftRoot });
	const [app, staticMatches] = await Promise.all([
		appPromise,
		staticMatchesPromise,
	]);
	return buildAudioProbeReport({ app, draftSamples, inventory, staticMatches });
}

function usage(): string {
	return [
		"Usage:",
		"  bun research/jianying-basic-audio-probe/probe-report.ts",
		"    [--app <VideoFusion-macOS.app>] [--draft-root <projects-directory>]",
	].join("\n");
}

export function parseProbeCliOptions({
	argv,
}: {
	argv: string[];
}): ProbeCliOptions {
	const values = new Map<string, string>();
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (!(flag === "--app" || flag === "--draft-root")) {
			throw new Error(
				`${flag ? `Unknown option ${flag}.` : "Missing option."}\n${usage()}`
			);
		}
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${flag}.\n${usage()}`);
		}
		if (values.has(flag)) throw new Error(`Duplicate option ${flag}.`);
		values.set(flag, value);
		index += 1;
	}
	return {
		appPath: path.resolve(values.get("--app") ?? DEFAULT_APP_PATH),
		draftRoot: path.resolve(values.get("--draft-root") ?? DEFAULT_DRAFT_ROOT),
	};
}

if (import.meta.main) {
	try {
		const report = await collectAudioProbeReport({
			...parseProbeCliOptions({ argv: process.argv.slice(2) }),
		});
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} catch (error) {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	}
}
