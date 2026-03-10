import { platform } from "@qcut/platform-core";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "./debug/error-handler";

/**
 * Retrieve the repository's GitHub stargazer count and format it as a concise string.
 *
 * The formatted string uses "M" for millions (e.g., "1.5M"), "k" for thousands (e.g., "1.5k"),
 * or the exact numeric count when less than 1,000. On error, a fallback value of "1.5k" is returned.
 *
 * @returns The formatted stargazer count string.
 */
export async function getStars(): Promise<string> {
	try {
		let count: number;

		// Check if we're in Electron environment
		if (platform().isElectron) {
			// Use IPC to fetch GitHub stars through Electron main process
			const result = await platform().github.fetchStars();
			const stars = result.stars;
			if (typeof stars !== "number" || !Number.isFinite(stars)) {
				throw new Error(
					"Invalid stargazers_count from platform GitHub bridge",
				);
			}
			count = stars;
		} else {
			// Fallback to direct fetch (for web/dev environment)
			const res = await fetch(
				"https://api.github.com/repos/donghaozhang/qcut",
				{
					// Remove problematic Cache-Control header
					headers: {
						"Accept": "application/vnd.github.v3+json",
					},
				}
			);

			if (!res.ok) {
				throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
			}
			const data = (await res.json()) as { stargazers_count: number };
			count = data.stargazers_count;
		}

		if (typeof count !== "number") {
			throw new Error("Invalid stargazers_count from GitHub API");
		}

		if (count >= 1_000_000)
			return (count / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
		if (count >= 1000)
			return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
		return count.toString();
	} catch (error) {
		handleError(error, {
			operation: "Fetch GitHub Stars",
			category: ErrorCategory.NETWORK,
			severity: ErrorSeverity.LOW,
			showToast: false,
			metadata: {
				repository: "donghaozhang/qcut",
			},
		});
		return "1.5k"; // Return fallback value
	}
}
