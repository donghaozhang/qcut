/**
 * Sync skills from .claude/skills/ to resources/default-skills/ and .agents/skills/
 *
 * This script makes .claude/skills/ the single source of truth for bundled skills.
 * Run during build to copy skills to the resources folder for production bundling
 * and to Codex's repository skill folder.
 *
 * Usage: bun scripts/sync-skills.ts
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
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
const CODEX_OPENAI_METADATA: Record<
	string,
	{
		displayName: string;
		shortDescription: string;
		defaultPrompt: string;
	}
> = {
	"codex-delegate": {
		displayName: "Codex Delegate",
		shortDescription: "Decide when to delegate QCut work to Codex",
		defaultPrompt:
			"Use this skill to decide whether a QCut task should be handled directly or delegated to Codex CLI, then follow the recommended path.",
	},
	"libtv-skill": {
		displayName: "LibTV Media",
		shortDescription: "Generate and edit AI images and videos with liblib.tv",
		defaultPrompt:
			"Use this skill for AI image or video generation, editing, style transfer, video continuation, storyboards, ads, music videos, or liblib.tv progress checks.",
	},
	"linear-cli": {
		displayName: "Linear CLI",
		shortDescription: "Manage Linear issues from the command line",
		defaultPrompt:
			"Use the Linear CLI skill to inspect, create, update, or organize Linear issues from this repository.",
	},
	"native-cli": {
		displayName: "QCut Native CLI",
		shortDescription: "Run QCut pipeline and editor automation commands",
		defaultPrompt:
			"Use QCut's native CLI for AI generation, media analysis, transcription, YAML pipelines, ViMax production, project management, or deterministic editor automation.",
	},
	"pr-comments": {
		displayName: "PR Comments",
		shortDescription: "Export and fix GitHub PR review comments",
		defaultPrompt:
			"Use this skill to export GitHub PR review comments, preprocess review feedback, and address actionable CodeRabbit, Gemini, Devin, or human review comments.",
	},
	qagent: {
		displayName: "QAgent",
		shortDescription: "Orchestrate parallel QCut development agents",
		defaultPrompt:
			"Use QAgent to spawn agents, check session status, manage PR work, handle CI failures, or batch-process QCut development tasks.",
	},
	"qcut-toolkit": {
		displayName: "QCut Toolkit",
		shortDescription: "Use QCut media, FFmpeg, AI generation, and editor tools",
		defaultPrompt:
			"Use the QCut toolkit for media workflows, file organization, video processing, AI generation, editor control, video prompts, or content pipeline tasks.",
	},
};

/**
 * Written into the Codex mirror by writeCodexOpenAiMetadata, never authored.
 * Matched exactly: only this path is generated, so a nested skill's own
 * agents/openai.yaml still has to come from the source.
 */
const GENERATED_MIRROR_FILE = join("agents", "openai.yaml");

function isFile({ filePath }: { filePath: string }): boolean {
	return statSync(filePath, { throwIfNoEntry: false })?.isFile() === true;
}

function listRelativeFiles({ root }: { root: string }): string[] {
	if (!existsSync(root)) return [];
	return readdirSync(root, { recursive: true })
		.map((entry) => String(entry))
		.filter((entry) => isFile({ filePath: join(root, entry) }));
}

/**
 * The sync deletes each target before copying, so a skill authored directly in
 * a mirror is destroyed on the next build with nothing failing — that is how
 * jianying-audio-reference and jianying-transition-reference reached master
 * present in .agents/skills but absent from both the source and the packaged
 * resources. Refuse to run instead of silently discarding that work.
 */
function assertNoUnsourcedFiles({
	sourcePath,
	targetPath,
}: {
	sourcePath: string;
	targetPath: string;
}) {
	// A source directory standing where the target holds a file is not a source
	// for it, so the counterpart has to be a file rather than merely present.
	const unsourced = listRelativeFiles({ root: targetPath }).filter(
		(relativePath) =>
			relativePath !== GENERATED_MIRROR_FILE &&
			!isFile({ filePath: join(sourcePath, relativePath) })
	);
	if (unsourced.length === 0) return;

	const sample = unsourced.slice(0, 5).join("\n  ");
	const more =
		unsourced.length > 5 ? `\n  …and ${unsourced.length - 5} more` : "";
	throw new Error(
		`${targetPath} has ${unsourced.length} file(s) that ${sourcePath} does not:\n  ${sample}${more}\n` +
			`Mirrors are generated. Author the skill in ${SOURCE_DIR} and rerun; syncing now would delete this work.`
	);
}

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

		assertNoUnsourcedFiles({ sourcePath, targetPath });

		// Remove existing target if it exists
		if (existsSync(targetPath)) {
			rmSync(targetPath, { recursive: true });
		}

		// Copy skill folder
		cpSync(sourcePath, targetPath, { recursive: true });
		process.stdout.write(`✅ Synced: ${skillName} → ${targetDir}\n`);
	}
}

function quoteYaml(value: string) {
	return JSON.stringify(value);
}

function writeCodexOpenAiMetadata() {
	for (const [skillName, metadata] of Object.entries(CODEX_OPENAI_METADATA)) {
		const agentsDir = join(CODEX_TARGET_DIR, skillName, "agents");
		mkdirSync(agentsDir, { recursive: true });
		const content = [
			"interface:",
			`  display_name: ${quoteYaml(metadata.displayName)}`,
			`  short_description: ${quoteYaml(metadata.shortDescription)}`,
			`  default_prompt: ${quoteYaml(metadata.defaultPrompt)}`,
			"",
		].join("\n");
		writeFileSync(join(agentsDir, "openai.yaml"), content);
		process.stdout.write(`✅ Wrote OpenAI metadata: ${skillName}\n`);
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
	writeCodexOpenAiMetadata();

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
