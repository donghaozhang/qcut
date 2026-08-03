import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	resolveAutoUpdateConfig,
	verifyPackagedUpdateConfig,
} from "../auto-update-config";

const temporaryDirectories: string[] = [];

function createDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "qcut-update-config-"));
	temporaryDirectories.push(directory);
	return directory;
}

function writeOfficialConfig({ configPath }: { configPath: string }): void {
	writeFileSync(
		configPath,
		[
			"owner: Quriosity-agent",
			"repo: qcut",
			"provider: github",
			"private: false",
			"releaseType: release",
			"channel: latest",
			"updaterCacheDirName: qcut-updater",
		].join("\n")
	);
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("auto-update config", () => {
	it("accepts the official packaged configuration", () => {
		const directory = createDirectory();
		const configPath = join(directory, "app-update.yml");
		writeOfficialConfig({ configPath });

		expect(() => verifyPackagedUpdateConfig({ configPath })).not.toThrow();
	});

	it("rejects packaged metadata for a different repository", () => {
		const directory = createDirectory();
		const configPath = join(directory, "app-update.yml");
		writeOfficialConfig({ configPath });
		writeFileSync(
			configPath,
			readFileSync(configPath, "utf8").replace("repo: qcut", "repo: other")
		);

		expect(() => verifyPackagedUpdateConfig({ configPath })).toThrow(
			"invalid repo"
		);
	});

	it("uses the packaged config when it is valid", () => {
		const directory = createDirectory();
		const resourcesPath = join(directory, "resources");
		const userDataPath = join(directory, "user-data");
		mkdirSync(resourcesPath);
		const configPath = join(resourcesPath, "app-update.yml");
		writeOfficialConfig({ configPath });

		expect(resolveAutoUpdateConfig({ resourcesPath, userDataPath })).toEqual({
			configPath,
			source: "packaged",
		});
	});

	it("writes an official fallback when packaged metadata is missing", () => {
		const directory = createDirectory();
		const resourcesPath = join(directory, "resources");
		const userDataPath = join(directory, "user-data");
		mkdirSync(resourcesPath);

		const resolved = resolveAutoUpdateConfig({ resourcesPath, userDataPath });

		expect(resolved.source).toBe("fallback");
		expect(resolved.packagedConfigError).toContain("is missing");
		expect(() =>
			verifyPackagedUpdateConfig({ configPath: resolved.configPath })
		).not.toThrow();
	});

	it("replaces invalid packaged metadata with the official fallback", () => {
		const directory = createDirectory();
		const resourcesPath = join(directory, "resources");
		const userDataPath = join(directory, "user-data");
		mkdirSync(resourcesPath);
		const packagedConfigPath = join(resourcesPath, "app-update.yml");
		writeOfficialConfig({ configPath: packagedConfigPath });
		writeFileSync(
			packagedConfigPath,
			readFileSync(packagedConfigPath, "utf8").replace(
				"owner: Quriosity-agent",
				"owner: untrusted"
			)
		);

		const resolved = resolveAutoUpdateConfig({ resourcesPath, userDataPath });

		expect(resolved.source).toBe("fallback");
		expect(resolved.packagedConfigError).toContain("invalid owner");
		expect(() =>
			verifyPackagedUpdateConfig({ configPath: resolved.configPath })
		).not.toThrow();
	});

	it("preserves an explicit update config override", () => {
		const directory = createDirectory();
		const overridePath = join(directory, "dev-app-update.yml");

		expect(
			resolveAutoUpdateConfig({
				resourcesPath: join(directory, "resources"),
				userDataPath: join(directory, "user-data"),
				overridePath,
			})
		).toEqual({ configPath: overridePath, source: "override" });
	});
});
