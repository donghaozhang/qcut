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
 * Record that the user dismissed update notifications for a specific release version.
 *
 * If persistent storage is unavailable (for example, localStorage is inaccessible), the call is a no-op.
 *
 * @param version - The release version to mark as dismissed
 */
export function dismissVersion(version: string): void {
	try {
		localStorage.setItem(DISMISSED_VERSION_KEY, version);
	} catch {
		// localStorage may not be available
	}
}

/**
 * Retrieve release notes for a specific version or the latest available.
 *
 * @param version - Optional version identifier to fetch release notes for; when omitted, fetches the latest release notes
 * @returns The release notes for the requested version, or `null` if not found or an error occurred
 */
export async function fetchReleaseNotes(
	version?: string
): Promise<ReleaseNote | null> {
	try {
		return (await platform().updates.getReleaseNotes(
			version
		)) as ReleaseNote | null;
	} catch {
		return null;
	}
}

/**
 * Retrieve the application's full changelog from the platform update API.
 *
 * @returns An array of `ReleaseNote` objects representing changelog entries; an empty array if retrieval fails.
 */
export async function fetchChangelog(): Promise<ReleaseNote[]> {
	try {
		return (await platform().updates.getChangelog()) as ReleaseNote[];
	} catch {
		return [];
	}
}
