/**
 * Sync skills from .claude/skills/ to resources/default-skills/ and .agents/skills/
 *
 * This script makes .claude/skills/ the single source of truth for bundled skills.
 * Run during build to copy skills to the resources folder for production bundling
 * and to Codex's repository skill folder.
 *
 * Usage: bun scripts/sync-skills.ts
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SOURCE_DIR = ".claude/skills";
const TARGET_DIR = "resources/default-skills";
const CODEX_TARGET_DIR = ".agents/skills";

// Skills to sync (add new bundled skills here)
const BUNDLED_SKILLS = ["ai-content-pipeline", "native-cli", "qcut-toolkit"];
const CODEX_SKILLS = [
	"codex-delegate",
	"libtv-skill",
	"linear-cli",
	"native-cli",
	"pr-comments",
	"qagent",
	"qcut-toolkit",
];

function syncSkillSet(targetDir: string, skillNames: string[]) {
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}

	for (const skillName of skillNames) {
		const sourcePath = join(SOURCE_DIR, skillName);
		const targetPath = join(targetDir, skillName);

		if (!existsSync(sourcePath)) {
			process.stderr.write(`⚠️  Skill not found: ${sourcePath}\n`);
			continue;
		}

		// Remove existing target if it exists
		if (existsSync(targetPath)) {
			rmSync(targetPath, { recursive: true });
		}

		// Copy skill folder
		cpSync(sourcePath, targetPath, { recursive: true });
		process.stdout.write(`✅ Synced: ${skillName} → ${targetDir}\n`);
	}
}

function syncSkills() {
	process.stdout.write(
		"📦 Syncing skills from .claude/skills/ → resources/default-skills/\n"
	);
	syncSkillSet(TARGET_DIR, BUNDLED_SKILLS);

	process.stdout.write(
		"📦 Syncing skills from .claude/skills/ → .agents/skills/\n"
	);
	syncSkillSet(CODEX_TARGET_DIR, CODEX_SKILLS);

	process.stdout.write("✨ Skills sync complete!\n");
}

try {
	syncSkills();
} catch (error) {
	process.stderr.write(
		`sync-skills failed: ${
			error instanceof Error ? error.message : String(error)
		}\n`
	);
	process.exitCode = 1;
}
