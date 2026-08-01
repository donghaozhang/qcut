import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMigrationApi } from "../capcut-e2e/migration-api-contract.js";

const PROJECT_ROOT = join(__dirname, "../..");
const temporaryProjectRoots: string[] = [];

afterEach(async () => {
	const directories = temporaryProjectRoots.splice(0);
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { force: true, recursive: true })
		)
	);
});

describe("CapCut migration API contract", () => {
	it("dynamically loads migration modules from a project path containing spaces", async () => {
		const temporaryProjectRoot = await mkdtemp(
			join(PROJECT_ROOT, ".capcut migration api ")
		);
		temporaryProjectRoots.push(temporaryProjectRoot);
		const packageSourceDirectory = join(
			temporaryProjectRoot,
			"packages",
			"jianying-draft-export",
			"src"
		);
		await mkdir(packageSourceDirectory, { recursive: true });
		await Promise.all([
			writeFile(
				join(packageSourceDirectory, "capcut-8-1-migration-session.ts"),
				"export class CapCut81MigrationExportSession {}\n",
				"utf8"
			),
			writeFile(
				join(packageSourceDirectory, "capcut-8-1-migration-bundle-reader.ts"),
				"export async function verifyCapCut81MigrationBundle() {}\n",
				"utf8"
			),
		]);

		const api = await loadMigrationApi({ projectRoot: temporaryProjectRoot });

		expect(api.CapCut81MigrationExportSession).toBeTypeOf("function");
		expect(api.verifyCapCut81MigrationBundle).toBeTypeOf("function");
	});
});
