import { platform } from "@qcut/platform-core";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "./debug/error-handler";

export async function getStars(): Promise<string> {
	try {
		let count: number;

		// Check if we're in Electron environment
		if (platform().isElectron) {
			// Use IPC to fetch GitHub stars through Electron main process
			const result = await platform().github.fetchStars();
			count = result.stars || 0;
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
