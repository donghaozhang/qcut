/**
 * CLI Output Formatters
 *
 * Command-specific TTY output formatting for non-JSON mode.
 * Extracted from cli.ts to keep it under 800 lines.
 *
 * @module electron/native-pipeline/cli-output-formatters
 */

import type { CLIResult } from "./cli-runner/types.js";

/**
 * Format and print command-specific output for TTY mode.
 * Called after a successful command when not in --json mode.
 */
export function formatCommandOutput(command: string, result: CLIResult): void {
	if (!result.data) return;

	// Model listing commands
	if (
		command === "list-models" ||
		command === "vimax:list-models" ||
		command === "list-video-models" ||
		command === "list-avatar-models" ||
		command === "list-motion-models" ||
		command === "list-speech-models"
	) {
		const data = result.data as {
			models: {
				key: string;
				name: string;
				provider: string;
				categories: string[];
			}[];
			count: number;
		};
		console.log(`\nAvailable models (${data.count}):\n`);
		for (const m of data.models) {
			console.log(
				`  ${m.key.padEnd(35)} ${m.provider.padEnd(15)} ${m.categories.join(", ")}`
			);
		}
		return;
	}

	if (command === "estimate-cost") {
		const data = result.data as {
			model: string;
			totalCost: number;
			breakdown: { item: string; cost: number }[];
		};
		console.log(
			`\nCost estimate for ${data.model}: $${data.totalCost.toFixed(3)}`
		);
		for (const b of data.breakdown) {
			console.log(`  ${b.item}: $${b.cost.toFixed(4)}`);
		}
		return;
	}

	if (command === "analyze-video" || command === "transcribe") {
		console.log(
			`\n${typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}`
		);
		return;
	}

	if (command === "check-keys") {
		const data = result.data as {
			keys: {
				name: string;
				configured: boolean;
				source: string;
				masked?: string;
			}[];
		};
		console.log("\nAPI Key Status:\n");
		for (const k of data.keys) {
			const status = k.configured
				? `configured (${k.source}) ${k.masked || ""}`
				: "not set";
			console.log(`  ${k.name.padEnd(25)} ${status}`);
		}
		return;
	}

	if (command === "create-examples") {
		const data = result.data as { created: string[]; count: number };
		console.log(`\nCreated ${data.count} example pipelines:`);
		for (const p of data.created) {
			console.log(`  ${p}`);
		}
		return;
	}

	if (command === "setup") {
		const data = result.data as { message: string };
		console.log(`\n${data.message}`);
		return;
	}

	if (
		command === "login" ||
		command === "signup" ||
		command === "logout"
	) {
		const data = result.data as { message?: string };
		if (data.message) console.log(data.message);
		return;
	}

	if (
		command === "set-key" ||
		command === "get-key" ||
		command === "delete-key"
	) {
		const data = result.data as {
			message?: string;
			name?: string;
			masked?: string;
			value?: string;
		};
		if (data.message) console.log(data.message);
		if (data.value) console.log(`${data.name}: ${data.value}`);
		else if (data.masked) console.log(`${data.name}: ${data.masked}`);
		return;
	}

	if (command === "init-project") {
		const data = result.data as {
			projectDir: string;
			created: string[];
			message: string;
		};
		console.log(`\n${data.message}`);
		if (data.created.length > 0) {
			console.log(`  Project: ${data.projectDir}`);
			for (const dir of data.created) {
				console.log(`  + ${dir}`);
			}
		}
		return;
	}

	if (command === "organize-project") {
		const data = result.data as {
			moved: number;
			message: string;
			files?: { from: string; to: string; category: string }[];
		};
		console.log(`\n${data.message}`);
		if (data.files && data.files.length > 0) {
			for (const f of data.files) {
				console.log(`  ${f.from} → ${f.category}/`);
			}
		}
		return;
	}

	if (command === "structure-info") {
		const data = result.data as {
			projectDir: string;
			directories: { path: string; fileCount: number; exists: boolean }[];
			totalFiles: number;
		};
		console.log(`\nProject: ${data.projectDir}`);
		console.log(`Total files: ${data.totalFiles}\n`);
		for (const dir of data.directories) {
			const status = dir.exists
				? `${String(dir.fileCount).padStart(4)} files`
				: "  (missing)";
			console.log(`  ${dir.path.padEnd(25)} ${status}`);
		}
		return;
	}

	if (command === "vimax:extract-characters") {
		const data = result.data as { characters: unknown[]; count: number };
		console.log(`\nExtracted ${data.count} characters`);
		return;
	}

	if (command === "vimax:generate-script") {
		const data = result.data as {
			title: string;
			scenes: number;
			total_duration: number;
		};
		console.log(
			`\nGenerated script: "${data.title}" (${data.scenes} scenes, ${data.total_duration.toFixed(1)}s)`
		);
		return;
	}

	// Editor commands: print data as formatted JSON or raw markdown
	if (command.startsWith("editor:")) {
		if (
			command === "editor:project:summary" &&
			typeof (result.data as { markdown?: string }).markdown === "string"
		) {
			console.log((result.data as { markdown: string }).markdown);
		} else {
			console.log(JSON.stringify(result.data, null, 2));
		}
		return;
	}

	if (command === "moyin:parse-script") {
		const d = result.data as {
			title?: string;
			genre?: string;
			logline?: string;
			characters?: number;
			scenes?: number;
			episodes?: number;
			provider?: string;
			model?: string;
		};
		console.log(`\nTitle:      ${d.title || "Untitled"}`);
		console.log(`Genre:      ${d.genre || "Unknown"}`);
		console.log(`Logline:    ${d.logline || "-"}`);
		console.log(`Characters: ${d.characters ?? 0}`);
		console.log(`Scenes:     ${d.scenes ?? 0}`);
		console.log(`Episodes:   ${d.episodes ?? 0}`);
		if (d.provider) {
			console.log(`Provider:   ${d.provider} (${d.model || "default"})`);
		}
		return;
	}

	if (command === "vimax:show-registry") {
		const data = result.data as {
			project_id: string;
			characters: unknown[];
			total_characters: number;
		};
		console.log(
			`\nRegistry (${data.project_id}): ${data.total_characters} characters`
		);
		console.log(JSON.stringify(data.characters, null, 2));
		return;
	}
}
