import { platform } from "@qcut/platform-core";
import type { ReleaseNote } from "@/types/electron";

const DISMISSED_VERSION_KEY = "qcut-update-dismissed-version";

/**
 * Extract the top N highlights from "What's New" section of release note content.
 */
export function extractHighlights(content: string, maxItems = 3): string[] {
	// Look for "What's New" or "Added" section
	const sectionMatch = content.match(
		/##\s+(?:What's New|Added)\s*\n([\s\S]*?)(?=\n##|\n$|$)/i
	);
	if (!sectionMatch) return [];

	const lines = sectionMatch[1]
		.split("\n")
		.map((line) => line.replace(/^[-*]\s*/, "").trim())
		.filter((line) => line.length > 0);

	return lines.slice(0, maxItems);
}

/**
 * Get the channel badge color for display.
 */
export function getChannelColor(
	channel: string
): "default" | "destructive" | "secondary" | "outline" {
	switch (channel) {
		case "alpha":
			return "destructive";
		case "beta":
			return "secondary";
		case "rc":
			return "outline";
		default:
			return "default";
	}
}

/**
 * Check if the user has already dismissed the notification for a specific version.
 */
export function isVersionDismissed(version: string): boolean {
	try {
		return localStorage.getItem(DISMISSED_VERSION_KEY) === version;
	} catch {
		return false;
	}
}

/**
 * Dismiss the update notification for a specific version.
 */
export function dismissVersion(version: string): void {
	try {
		localStorage.setItem(DISMISSED_VERSION_KEY, version);
	} catch {
		// localStorage may not be available
	}
}

/**
 * Fetch release notes via platform API, with graceful fallback.
 */
export async function fetchReleaseNotes(
	version?: string
): Promise<ReleaseNote | null> {
	try {
		return (await platform().updates.getReleaseNotes(version)) as ReleaseNote | null;
	} catch {
		return null;
	}
}

/**
 * Fetch the full changelog via platform API.
 */
export async function fetchChangelog(): Promise<ReleaseNote[]> {
	try {
		return (await platform().updates.getChangelog()) as ReleaseNote[];
	} catch {
		return [];
	}
}
