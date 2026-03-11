import {
	CLAUDE_CAPABILITY_CATEGORIES,
	type ApiVersionInfo,
	type Capability,
	type CapabilityManifest,
} from "../../types/claude-api-capabilities.js";

const CLAUDE_API_VERSION = "1.1.0";
const CLAUDE_PROTOCOL_VERSION = "1.0.0";

const CAPABILITIES: Capability[] = [
	{
		name: "state.health",
		version: "1.0.0",
		description:
			"Health checks for editor connectivity and version inspection.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.STATE,
	},
	{
		name: "state.capabilities",
		version: "1.0.0",
		description:
			"Capability manifest and feature/version negotiation endpoints.",
		since: "1.1.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.STATE,
	},
	{
		name: "state.commandRegistry",
		version: "1.0.0",
		description:
			"Machine-readable CLI command registry with parameter schemas.",
		since: "1.1.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.STATE,
	},
	{
		name: "state.ui.panelSwitch",
		version: "1.0.0",
		description: "Editor panel switching and UI state navigation.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.STATE,
	},
	{
		name: "state.moyin.pipeline",
		version: "1.0.0",
		description:
			"Moyin/director panel script injection and parse status actions.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.STATE,
	},
	{
		name: "media.library",
		version: "1.0.0",
		description: "Media listing, info lookup, rename, and delete operations.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.import.local",
		version: "1.0.0",
		description: "Import media from local filesystem paths.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.import.url",
		version: "1.0.0",
		description: "Import media from remote URLs.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.import.batch",
		version: "1.0.0",
		description: "Batch media import from paths and URLs.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.extractFrame",
		version: "1.0.0",
		description: "Extract still frames from imported video assets.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.screenRecording",
		version: "1.0.0",
		description: "Screen recording source enumeration and recording control.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "media.screenshot",
		version: "1.0.0",
		description: "QCut window screenshot capture.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.MEDIA,
	},
	{
		name: "project.settings",
		version: "1.0.0",
		description: "Read and update project settings.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.PROJECT,
	},
	{
		name: "project.stats",
		version: "1.0.0",
		description: "Project timeline and media statistics.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.PROJECT,
	},
	{
		name: "project.summary",
		version: "1.0.0",
		description: "Project summary and pipeline report generation.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.PROJECT,
	},
	{
		name: "project.navigator",
		version: "1.0.0",
		description: "List local projects and navigate the editor to a project.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.PROJECT,
	},
	{
		name: "project.crud",
		version: "1.0.0",
		description: "Create, rename, duplicate, and delete projects.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.PROJECT,
	},
	{
		name: "timeline.read",
		version: "1.0.0",
		description: "Export timeline as JSON or markdown.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.import",
		version: "1.0.0",
		description: "Import timeline payloads into the editor.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.elements",
		version: "1.0.0",
		description:
			"Single-element create, update, delete, split, and move operations.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.batch",
		version: "1.0.0",
		description: "Batch add, update, and delete timeline elements.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.arrange",
		version: "1.0.0",
		description: "Automatic timeline arrangement and sequencing utilities.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.selection",
		version: "1.0.0",
		description: "Read and modify current timeline selection.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.cuts",
		version: "1.0.0",
		description: "Cut-list application and range deletion operations.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "timeline.autoEdit",
		version: "1.0.0",
		description: "Auto-edit jobs and job polling endpoints.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TIMELINE,
	},
	{
		name: "export.presets",
		version: "1.0.0",
		description: "Export preset listing and recommendation endpoints.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.EXPORT,
	},
	{
		name: "export.jobs",
		version: "1.0.0",
		description: "Export job creation, status lookup, and listing.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.EXPORT,
	},
	{
		name: "export.remotion",
		version: "1.0.0",
		description: "Remotion inspection, prop updates, and export integration.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.EXPORT,
	},
	{
		name: "analysis.video",
		version: "1.0.0",
		description:
			"Video analysis endpoints (timeline, scenes, frames, fillers).",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.models",
		version: "1.0.0",
		description:
			"Model listing endpoints for analysis and generation workflows.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.transcription",
		version: "1.0.0",
		description: "Transcription endpoints and async job management.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.suggestCuts",
		version: "1.0.0",
		description: "AI cut suggestion endpoints and async status polling.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.search",
		version: "1.0.0",
		description: "Transcription search endpoints for content discovery.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.generate",
		version: "1.0.0",
		description: "AI generation endpoints and async job management.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "analysis.diagnostics",
		version: "1.0.0",
		description: "Diagnostic analysis and system troubleshooting helpers.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.ANALYSIS,
	},
	{
		name: "events.rendererBridge",
		version: "1.0.0",
		description: "Renderer event bridge used by editor-control HTTP endpoints.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.EVENTS,
	},
	{
		name: "events.mcpPreview",
		version: "1.0.0",
		description: "MCP preview HTML forwarding endpoint.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.EVENTS,
	},
	{
		name: "transactions.batchMutations",
		version: "1.0.0",
		description: "Batch mutation semantics for timeline operations.",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TRANSACTIONS,
	},
	{
		name: "transactions.asyncJobs",
		version: "1.0.0",
		description:
			"Asynchronous job lifecycle endpoints (start/status/list/cancel).",
		since: "1.0.0",
		category: CLAUDE_CAPABILITY_CATEGORIES.TRANSACTIONS,
	},
];

type CapabilityCheckResult = {
	supported: boolean;
	version?: string;
	since?: string;
	deprecated?: boolean;
	alternatives?: string[];
};

type ParsedSemver = {
	major: number;
	minor: number;
	patch: number;
};

function cloneCapability({
	capability,
}: {
	capability: Capability;
}): Capability {
	try {
		return { ...capability, alternatives: capability.alternatives?.slice() };
	} catch {
		return capability;
	}
}

function parseSemver({ value }: { value: string }): ParsedSemver | null {
	try {
		const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
		if (!match) {
			return null;
		}
		return {
			major: Number.parseInt(match[1], 10),
			minor: Number.parseInt(match[2], 10),
			patch: Number.parseInt(match[3], 10),
		};
	} catch {
		return null;
	}
}

function compareSemver({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	try {
		const leftParsed = parseSemver({ value: left });
		const rightParsed = parseSemver({ value: right });
		if (!leftParsed || !rightParsed) {
			return left.localeCompare(right, undefined, { numeric: true });
		}
		if (leftParsed.major !== rightParsed.major) {
			return leftParsed.major - rightParsed.major;
		}
		if (leftParsed.minor !== rightParsed.minor) {
			return leftParsed.minor - rightParsed.minor;
		}
		return leftParsed.patch - rightParsed.patch;
	} catch {
		return 0;
	}
}

function findCapability({ name }: { name: string }): Capability | undefined {
	try {
		return CAPABILITIES.find((capability) => capability.name === name);
	} catch {
		return undefined;
	}
}

function findAlternatives({ name }: { name: string }): string[] | undefined {
	try {
		const samePrefix = CAPABILITIES.filter((capability) => {
			return capability.name !== name && capability.name.startsWith(`${name}.`);
		}).map((capability) => capability.name);
		if (samePrefix.length > 0) {
			return samePrefix.slice(0, 5);
		}

		const topLevelPrefix = name.split(".")[0];
		if (!topLevelPrefix) {
			return undefined;
		}
		const related = CAPABILITIES.filter((capability) =>
			capability.name.startsWith(`${topLevelPrefix}.`)
		).map((capability) => capability.name);
		return related.length > 0 ? related.slice(0, 5) : undefined;
	} catch {
		return undefined;
	}
}

export function getCapabilities(): Capability[] {
	try {
		return CAPABILITIES.map((capability) => cloneCapability({ capability }));
	} catch {
		return [];
	}
}

export function hasCapability(name: string, minVersion?: string): boolean {
	try {
		const capability = findCapability({ name });
		if (!capability) {
			return false;
		}
		if (!minVersion) {
			return true;
		}
		return compareSemver({ left: capability.version, right: minVersion }) >= 0;
	} catch {
		return false;
	}
}

export function getApiVersion(): string {
	try {
		return CLAUDE_API_VERSION;
	} catch {
		return "0.0.0";
	}
}

export function getProtocolVersion(): string {
	try {
		return CLAUDE_PROTOCOL_VERSION;
	} catch {
		return "0.0.0";
	}
}

export function getCapabilityManifest(): CapabilityManifest {
	try {
		return {
			apiVersion: getApiVersion(),
			protocolVersion: getProtocolVersion(),
			capabilities: getCapabilities(),
		};
	} catch {
		return {
			apiVersion: "0.0.0",
			protocolVersion: "0.0.0",
			capabilities: [],
		};
	}
}

export function getApiVersionInfo({
	appVersion,
	electronVersion,
}: {
	appVersion: string;
	electronVersion: string;
}): ApiVersionInfo {
	try {
		return {
			apiVersion: getApiVersion(),
			protocolVersion: getProtocolVersion(),
			appVersion,
			electronVersion,
		};
	} catch {
		return {
			apiVersion: "0.0.0",
			protocolVersion: "0.0.0",
			appVersion,
			electronVersion,
		};
	}
}

export function getCapabilitySupport({
	name,
	minVersion,
}: {
	name: string;
	minVersion?: string;
}): CapabilityCheckResult {
	try {
		const capability = findCapability({ name });
		if (!capability) {
			return {
				supported: false,
				alternatives: findAlternatives({ name }),
			};
		}

		const supported = hasCapability(name, minVersion);
		return {
			supported,
			version: capability.version,
			since: capability.since,
			deprecated: capability.deprecated,
			alternatives: capability.alternatives,
		};
	} catch {
		return { supported: false };
	}
}
