import assert from "node:assert/strict";
import test from "node:test";
import { collectSubmissionFiles } from "./package-submission.mjs";

test("collects the public skills-only submission files", () => {
	const files = collectSubmissionFiles();

	assert.ok(files.includes(".codex-plugin/plugin.json"));
	assert.ok(files.includes("assets/icon.png"));
	assert.ok(files.includes("scripts/qcut-runner.mjs"));
	assert.ok(files.includes("skills/qcut-cli/SKILL.md"));
	assert.ok(files.includes("skills/qcut-editor/SKILL.md"));
});

test("excludes tests and repository submission notes", () => {
	const files = collectSubmissionFiles();

	assert.equal(
		files.some((file) => file.endsWith(".test.mjs")),
		false
	);
	assert.equal(
		files.some((file) => file.startsWith("submission/")),
		false
	);
	assert.equal(files.includes("PUBLISHING.md"), false);
});
