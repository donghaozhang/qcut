import { cache } from "react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function resolveConfigPath(): string | null {
	try {
		if (process.env.QAGENT_CONFIG_PATH) {
			const explicit = resolve(process.env.QAGENT_CONFIG_PATH);
			if (existsSync(explicit)) {
				return explicit;
			}
		}

		const fallbackCandidates = [
			resolve(process.cwd(), "qagent.yaml"),
			resolve(process.cwd(), "qagent.yml"),
		];
		for (const candidate of fallbackCandidates) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}

		return null;
	} catch {
		return null;
	}
}

function readProjectNameFromConfig(): string | null {
	try {
		const configPath = resolveConfigPath();
		if (!configPath) {
			return null;
		}

		const raw = readFileSync(configPath, "utf-8");
		const lines = raw.split(/\r?\n/);

		let inProjects = false;
		let firstProjectKey: string | null = null;
		let firstProjectIndent = 0;

		for (const line of lines) {
			if (!inProjects) {
				if (/^\s*projects:\s*$/.test(line)) {
					inProjects = true;
				}
				continue;
			}

			const projectMatch = line.match(/^(\s+)([A-Za-z0-9_-]+):\s*$/);
			if (projectMatch) {
				const indent = projectMatch[1].length;
				if (!firstProjectKey) {
					firstProjectKey = projectMatch[2];
					firstProjectIndent = indent;
					continue;
				}

				if (indent <= firstProjectIndent) {
					break;
				}
			}

			if (!firstProjectKey) {
				continue;
			}

			const namePattern = new RegExp(
				`^\\s{${String(firstProjectIndent + 2)},}name:\\s*(.+?)\\s*$`
			);
			const nameMatch = line.match(namePattern);
			if (nameMatch) {
				const cleaned = nameMatch[1].replace(/^['"]|['"]$/g, "").trim();
				if (cleaned.length > 0) {
					return cleaned;
				}
			}
		}

		return firstProjectKey;
	} catch {
		return null;
	}
}

/**
 * Load the primary project name from config.
 * Falls back to "qagent" if config is unavailable.
 *
 * Wrapped with React.cache() to deduplicate filesystem reads
 * within a single server render pass (layout + page + icon all
 * call this, but config is only read once per request).
 */
export const getProjectName = cache((): string => {
	try {
		const projectName = readProjectNameFromConfig();
		if (projectName) {
			return projectName;
		}
	} catch {
		// Config not available
	}
	return "qagent";
});
