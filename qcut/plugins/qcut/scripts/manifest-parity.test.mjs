import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readManifest({ directory }) {
	return JSON.parse(
		readFileSync(path.join(pluginRoot, directory, "plugin.json"), "utf8")
	);
}

/**
 * The Codex and Claude Code manifests describe the same plugin from the same
 * directory: one skills/, one scripts/, one assets/. Only the manifest files
 * differ, so they are the one place the two platforms can drift apart.
 */
test("the Codex and Claude Code manifests describe the same plugin", () => {
	const codex = readManifest({ directory: ".codex-plugin" });
	const claude = readManifest({ directory: ".claude-plugin" });

	for (const field of [
		"name",
		"version",
		"homepage",
		"repository",
		"license",
	]) {
		assert.equal(
			claude[field],
			codex[field],
			`${field} differs between .claude-plugin and .codex-plugin`
		);
	}
	assert.deepEqual(
		claude.author,
		codex.author,
		"author differs between .claude-plugin and .codex-plugin"
	);
	assert.deepEqual(
		claude.keywords,
		codex.keywords,
		"keywords differ between .claude-plugin and .codex-plugin"
	);
});

test("the Claude Code manifest omits the Codex-only interface block", () => {
	const claude = readManifest({ directory: ".claude-plugin" });
	// claude plugin validate warns "Unknown field 'interface'" when present.
	assert.equal(claude.interface, undefined);
});

test("the app-directory marketplace entry points at this plugin", () => {
	const marketplace = JSON.parse(
		readFileSync(
			path.join(pluginRoot, "..", "..", ".claude-plugin", "marketplace.json"),
			"utf8"
		)
	);
	const entry = marketplace.plugins.find((plugin) => plugin.name === "qcut");
	assert.ok(entry, "app-directory marketplace.json has no qcut entry");
	assert.equal(entry.source, "./plugins/qcut");
});

test("the repository marketplace supports owner/repo installation", () => {
	const marketplace = JSON.parse(
		readFileSync(
			path.join(
				pluginRoot,
				"..",
				"..",
				"..",
				".claude-plugin",
				"marketplace.json"
			),
			"utf8"
		)
	);
	const entry = marketplace.plugins.find((plugin) => plugin.name === "qcut");
	assert.ok(entry, "repository marketplace.json has no qcut entry");
	assert.equal(entry.source, "./qcut/plugins/qcut");
});
