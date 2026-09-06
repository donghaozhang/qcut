// @vitest-environment node
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CreateKeychainOptions } from "app-builder-lib/out/codeSign/macCodeSign.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConsumer = createRequire(import.meta.url);
const loadElectronBuilder = createRequire(
	loadConsumer.resolve("electron-builder")
);
const signingModulePath = loadElectronBuilder.resolve(
	"app-builder-lib/out/codeSign/macCodeSign.js"
);
const loadSigningDependency = createRequire(signingModulePath);
const builderUtil = loadSigningDependency("builder-util") as {
	exec: (file: string, args: string[]) => Promise<string>;
	TmpDir: new () => CreateKeychainOptions["tmpDir"];
};
const certificateModule = loadSigningDependency("./codesign.js") as {
	importCertificate: (link: string) => Promise<string>;
};
const { createKeychain } = loadSigningDependency(signingModulePath) as {
	createKeychain: (
		options: CreateKeychainOptions
	) => Promise<{ keychainFile?: string | null }>;
};

const commands: { file: string; args: string[] }[] = [];
const applicationPassword = "application-p12-test-password";
const installerPassword = "installer-p12-test-password";
const applicationCertificate = path.join(tmpdir(), "application-test.p12");
const installerCertificate = path.join(tmpdir(), "installer-test.p12");
const currentDir = path.join(tmpdir(), "qcut-keychain-password-regression");

function options({
	installer = false,
	password = applicationPassword,
}: {
	installer?: boolean;
	password?: string;
} = {}): CreateKeychainOptions {
	return {
		tmpDir: new builderUtil.TmpDir(),
		currentDir,
		cscLink: applicationCertificate,
		cscKeyPassword: password,
		...(installer
			? { cscILink: installerCertificate, cscIKeyPassword: installerPassword }
			: {}),
	};
}

function command({ name }: { name: string }) {
	const matches = commands.filter(({ args }) => args[0] === name);
	expect(matches).toHaveLength(1);
	const match = matches[0];
	if (!match) {
		throw new Error(`Missing security command: ${name}`);
	}
	return match.args;
}

function expectKeychainPassword({
	keychainFile,
	certificatePasswords,
}: {
	keychainFile: string | null | undefined;
	certificatePasswords: string[];
}) {
	const create = command({ name: "create-keychain" });
	const generatedPassword = create[2];
	expect(generatedPassword).toEqual(expect.any(String));
	expect(generatedPassword).not.toBe("");
	expect(certificatePasswords).not.toContain(generatedPassword);
	expect(create).toEqual([
		"create-keychain",
		"-p",
		generatedPassword,
		keychainFile,
	]);
	expect(command({ name: "unlock-keychain" })).toEqual([
		"unlock-keychain",
		"-p",
		generatedPassword,
		keychainFile,
	]);
	const partitions = commands.filter(
		({ args }) => args[0] === "set-key-partition-list"
	);
	expect(partitions).toHaveLength(certificatePasswords.length);
	for (const { args } of partitions) {
		expect(args).toEqual([
			"set-key-partition-list",
			"-S",
			"apple-tool:,apple:",
			"-s",
			"-k",
			generatedPassword,
			keychainFile,
		]);
	}
	const imports = commands.filter(({ args }) => args[0] === "import");
	expect(imports.map(({ args }) => args.at(-1))).toEqual(certificatePasswords);
	for (const { args } of imports) {
		expect(args.slice(2, -1)).toEqual([
			"-k",
			keychainFile,
			"-T",
			"/usr/bin/codesign",
			"-T",
			"/usr/bin/productbuild",
			"-P",
		]);
	}
}

beforeEach(() => {
	commands.length = 0;
	// Skip the unrelated root-certificate cache; all native commands stay stubbed.
	vi.stubEnv("TRAVIS", "true");
	vi.stubEnv("APP_BUILDER_TMP_DIR", currentDir);
	vi.spyOn(certificateModule, "importCertificate").mockImplementation(
		async (link) => link
	);
	vi.spyOn(builderUtil, "exec").mockImplementation(async (file, args) => {
		expect(file).toBe("/usr/bin/security");
		commands.push({ file, args: [...args] });
		return "";
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("electron-builder temporary keychain passwords", () => {
	it.each([
		applicationPassword,
		"",
	])("keeps a P12 password (%j) separate from the generated keychain password", async (password) => {
		const result = await createKeychain(options({ password }));
		expectKeychainPassword({
			keychainFile: result.keychainFile,
			certificatePasswords: [password],
		});
		expect(command({ name: "import" })[1]).toBe(applicationCertificate);
	});

	it("shares the keychain password while retaining both certificate passwords", async () => {
		const result = await createKeychain(options({ installer: true }));
		expectKeychainPassword({
			keychainFile: result.keychainFile,
			certificatePasswords: [applicationPassword, installerPassword],
		});
		expect(
			commands
				.filter(({ args }) => args[0] === "import")
				.map(({ args }) => args[1])
		).toEqual([applicationCertificate, installerCertificate]);
	});

	it.each([
		"create-keychain",
		"unlock-keychain",
		"import",
		"set-key-partition-list",
	])("propagates a native %s failure", async (failingCommand) => {
		const failure = new Error(`Synthetic security failure: ${failingCommand}`);
		vi.mocked(builderUtil.exec).mockImplementation(async (file, args) => {
			expect(file).toBe("/usr/bin/security");
			commands.push({ file, args: [...args] });
			if (args[0] === failingCommand) {
				throw failure;
			}
			return "";
		});
		await expect(createKeychain(options())).rejects.toBe(failure);
		expect(commands.at(-1)?.args[0]).toBe(failingCommand);
	});
});
