import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// -- XDG Paths (Section 3.3) --

import {
	configDir,
	cacheDir,
	stateDir,
	defaultConfigPath,
	ensureDir,
} from "../native-pipeline/infra/xdg-paths.js";

describe("XDG directory support", () => {
	it("configDir respects XDG_CONFIG_HOME", () => {
		const orig = process.env.XDG_CONFIG_HOME;
		const testPath = path.join(os.tmpdir(), "test-xdg-config");
		process.env.XDG_CONFIG_HOME = testPath;
		try {
			const dir = configDir();
			expect(dir).toContain("qcut-pipeline");
			expect(path.normalize(dir)).toContain(path.normalize(testPath));
		} finally {
			if (orig) process.env.XDG_CONFIG_HOME = orig;
			else delete process.env.XDG_CONFIG_HOME;
			fs.rmSync(testPath, { recursive: true, force: true });
		}
	});

	it("cacheDir respects XDG_CACHE_HOME", () => {
		const orig = process.env.XDG_CACHE_HOME;
		const testPath = path.join(os.tmpdir(), "test-xdg-cache");
		process.env.XDG_CACHE_HOME = testPath;
		try {
			const dir = cacheDir();
			expect(dir).toContain("qcut-pipeline");
			expect(path.normalize(dir)).toContain(path.normalize(testPath));
		} finally {
			if (orig) process.env.XDG_CACHE_HOME = orig;
			else delete process.env.XDG_CACHE_HOME;
			fs.rmSync(testPath, { recursive: true, force: true });
		}
	});

	it("stateDir respects XDG_STATE_HOME", () => {
		const orig = process.env.XDG_STATE_HOME;
		const testPath = path.join(os.tmpdir(), "test-xdg-state");
		process.env.XDG_STATE_HOME = testPath;
		try {
			const dir = stateDir();
			expect(dir).toContain("qcut-pipeline");
			expect(path.normalize(dir)).toContain(path.normalize(testPath));
		} finally {
			if (orig) process.env.XDG_STATE_HOME = orig;
			else delete process.env.XDG_STATE_HOME;
			fs.rmSync(testPath, { recursive: true, force: true });
		}
	});

	it("override parameter takes priority", () => {
		const testPath = path.join(os.tmpdir(), "test-override-config");
		const dir = configDir(testPath);
		expect(dir).toBe(testPath);
		fs.rmSync(testPath, { recursive: true, force: true });
	});

	it("defaultConfigPath returns yaml file path", () => {
		const testPath = path.join(os.tmpdir(), "test-cfg-path");
		const p = defaultConfigPath(testPath);
		expect(p).toContain("config.yaml");
		fs.rmSync(testPath, { recursive: true, force: true });
	});

	it("ensureDir creates directory", () => {
		const dir = path.join(os.tmpdir(), `test-ensure-${Date.now()}`);
		const result = ensureDir(dir);
		expect(result).toBe(dir);
		expect(fs.existsSync(dir)).toBe(true);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

// -- Platform Logger (Section 3.7) --

import {
	PlatformLogger,
	getLogger,
} from "../native-pipeline/infra/platform-logger.js";

describe("PlatformLogger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("creates logger with name", () => {
		const logger = new PlatformLogger("test");
		expect(logger.name).toBe("test");
	});

	it("getLogger factory creates logger", () => {
		const logger = getLogger("my-module", "warning");
		expect(logger.name).toBe("my-module");
	});

	it("respects log level", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = new PlatformLogger("test", "warning");
		logger.info("should not appear");
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("step, success, cost produce output", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		const logger = new PlatformLogger("test", "info");
		logger.step("step 1");
		logger.success("done");
		logger.cost(0.05);
		expect(spy).toHaveBeenCalledTimes(3);
		spy.mockRestore();
	});
});

// -- File Manager (Section 3.7) --

import { FileManager } from "../native-pipeline/infra/file-manager.js";

describe("FileManager", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = path.join(os.tmpdir(), `fm-test-${Date.now()}`);
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("writeText and readText", () => {
		const fm = new FileManager(tmpDir);
		const filePath = path.join(tmpDir, "test.txt");
		fm.writeText(filePath, "hello world");
		expect(fm.readText(filePath)).toBe("hello world");
	});

	it("exists checks file", () => {
		const fm = new FileManager(tmpDir);
		expect(fm.exists(path.join(tmpDir, "nonexistent"))).toBe(false);
		const filePath = path.join(tmpDir, "exists.txt");
		fs.writeFileSync(filePath, "x");
		expect(fm.exists(filePath)).toBe(true);
	});

	it("copyFile copies content", async () => {
		const fm = new FileManager(tmpDir);
		const src = path.join(tmpDir, "src.txt");
		const dst = path.join(tmpDir, "dst.txt");
		fs.writeFileSync(src, "copy me");
		await fm.copyFile(src, dst);
		expect(fs.readFileSync(dst, "utf-8")).toBe("copy me");
	});

	it("moveFile moves content", async () => {
		const fm = new FileManager(tmpDir);
		const src = path.join(tmpDir, "move-src.txt");
		const dst = path.join(tmpDir, "move-dst.txt");
		fs.writeFileSync(src, "move me");
		await fm.moveFile(src, dst);
		expect(fs.existsSync(src)).toBe(false);
		expect(fs.readFileSync(dst, "utf-8")).toBe("move me");
	});

	it("deleteFile removes file", async () => {
		const fm = new FileManager(tmpDir);
		const filePath = path.join(tmpDir, "delete-me.txt");
		fs.writeFileSync(filePath, "x");
		const deleted = await fm.deleteFile(filePath);
		expect(deleted).toBe(true);
		expect(fs.existsSync(filePath)).toBe(false);
	});

	it("deleteFile returns false for non-existent file", async () => {
		const fm = new FileManager(tmpDir);
		const deleted = await fm.deleteFile(path.join(tmpDir, "no-such-file"));
		expect(deleted).toBe(false);
	});

	it("getFileHash returns md5", async () => {
		const fm = new FileManager(tmpDir);
		const filePath = path.join(tmpDir, "hash.txt");
		fs.writeFileSync(filePath, "hello");
		const hash = await fm.getFileHash(filePath, "md5");
		expect(hash).toBe("5d41402abc4b2a76b9719d911017c592");
	});

	it("getFileInfo returns size and name", async () => {
		const fm = new FileManager(tmpDir);
		const filePath = path.join(tmpDir, "info.txt");
		fs.writeFileSync(filePath, "12345");
		const info = await fm.getFileInfo(filePath);
		expect(info.name).toBe("info.txt");
		expect(info.size).toBe(5);
		expect(info.isDirectory).toBe(false);
	});

	it("listFiles lists files", async () => {
		const fm = new FileManager(tmpDir);
		fs.writeFileSync(path.join(tmpDir, "a.txt"), "a");
		fs.writeFileSync(path.join(tmpDir, "b.txt"), "b");
		fs.writeFileSync(path.join(tmpDir, "c.json"), "c");
		const all = await fm.listFiles(tmpDir);
		expect(all.length).toBeGreaterThanOrEqual(3);
		const txtOnly = await fm.listFiles(tmpDir, "*.txt");
		expect(txtOnly.length).toBeGreaterThanOrEqual(2);
	});
});

// -- Validators (Section 3.7) --

import {
	ConfigValidator,
	InputValidator,
	configValidator,
	inputValidator,
} from "../native-pipeline/execution/validators.js";

describe("ConfigValidator", () => {
	it("rejects config without steps", () => {
		expect(() =>
			configValidator.validatePipelineConfig({
				steps: [],
			})
		).toThrow("at least one step");
	});

	it("rejects step without type", () => {
		expect(() =>
			configValidator.validatePipelineConfig({
				steps: [
					{ type: "", model: "x", params: {}, enabled: true, retryCount: 0 },
				],
			})
		).toThrow("type");
	});

	it("rejects step without model", () => {
		expect(() =>
			configValidator.validatePipelineConfig({
				steps: [
					{
						type: "text_to_image",
						model: "",
						params: {},
						enabled: true,
						retryCount: 0,
					},
				],
			})
		).toThrow("model");
	});

	it("accepts valid config", () => {
		const result = configValidator.validatePipelineConfig({
			steps: [
				{
					type: "text_to_image",
					model: "flux_dev",
					params: {},
					enabled: true,
					retryCount: 0,
				},
			],
		});
		expect(result).toBe(true);
	});
});

describe("InputValidator", () => {
	it("validates existing file path", () => {
		const filePath = path.join(os.tmpdir(), `iv-test-${Date.now()}.txt`);
		fs.writeFileSync(filePath, "test");
		const result = inputValidator.validateFilePath(filePath);
		expect(result).toBe(filePath);
		fs.unlinkSync(filePath);
	});

	it("rejects non-existent file", () => {
		const fakePath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.txt`);
		expect(() => inputValidator.validateFilePath(fakePath)).toThrow(
			"not found"
		);
	});

	it("validates HTTP URL", () => {
		expect(inputValidator.validateUrl("https://example.com")).toBe(
			"https://example.com"
		);
	});

	it("rejects invalid URL", () => {
		expect(() => inputValidator.validateUrl("not-a-url")).toThrow(
			"Invalid URL"
		);
	});

	it("rejects non-http URL", () => {
		expect(() => inputValidator.validateUrl("ftp://example.com")).toThrow(
			"http or https"
		);
	});

	it("validates API key", () => {
		expect(inputValidator.validateApiKey("sk-1234567890", "openai")).toBe(
			"sk-1234567890"
		);
	});

	it("rejects empty API key", () => {
		expect(() => inputValidator.validateApiKey("", "openai")).toThrow("empty");
	});

	it("rejects too-short API key", () => {
		expect(() => inputValidator.validateApiKey("abc", "openai")).toThrow(
			"too short"
		);
	});

	it("validates positive number", () => {
		expect(inputValidator.validatePositiveNumber(5, "count")).toBe(5);
	});

	it("rejects non-positive number", () => {
		expect(() => inputValidator.validatePositiveNumber(-1, "count")).toThrow(
			"positive"
		);
		expect(() => inputValidator.validatePositiveNumber(0, "count")).toThrow(
			"positive"
		);
	});
});

// -- Config Loader (Section 3.7) --

import {
	mergeConfigs,
	processEnvironmentVariables,
	loadEnvironmentConfig,
	loadJsonConfig,
	saveJsonConfig,
} from "../native-pipeline/execution/config-loader.js";

describe("Config loader", () => {
	it("mergeConfigs deep merges objects", () => {
		const base = { a: 1, nested: { x: 1, y: 2 } };
		const override = { b: 2, nested: { y: 3, z: 4 } };
		const result = mergeConfigs(base, override);
		expect(result).toEqual({ a: 1, b: 2, nested: { x: 1, y: 3, z: 4 } });
	});

	it("mergeConfigs replaces arrays", () => {
		const base = { items: [1, 2] };
		const override = { items: [3] };
		const result = mergeConfigs(base, override);
		expect(result.items).toEqual([3]);
	});

	it("processEnvironmentVariables interpolates ${VAR}", () => {
		process.env.TEST_CONFIG_VAR = "hello";
		const result = processEnvironmentVariables({ key: "${TEST_CONFIG_VAR}" });
		expect(result.key).toBe("hello");
		delete process.env.TEST_CONFIG_VAR;
	});

	it("processEnvironmentVariables supports default values", () => {
		delete process.env.NONEXISTENT_VAR_FOR_TEST;
		const result = processEnvironmentVariables({
			key: "${NONEXISTENT_VAR_FOR_TEST:-fallback}",
		});
		expect(result.key).toBe("fallback");
	});

	it("processEnvironmentVariables handles nested objects", () => {
		process.env.NESTED_TEST = "world";
		const result = processEnvironmentVariables({
			outer: { inner: "${NESTED_TEST}" },
		});
		expect((result.outer as Record<string, unknown>).inner).toBe("world");
		delete process.env.NESTED_TEST;
	});

	it("loadEnvironmentConfig loads .env file", () => {
		const envFile = path.join(os.tmpdir(), `test-env-${Date.now()}.env`);
		fs.writeFileSync(envFile, 'KEY1=value1\n# comment\nKEY2="value2"\n');
		const vars = loadEnvironmentConfig(envFile);
		expect(vars.KEY1).toBe("value1");
		expect(vars.KEY2).toBe("value2");
		fs.unlinkSync(envFile);
		delete process.env.KEY1;
		delete process.env.KEY2;
	});

	it("loadJsonConfig loads and interpolates", () => {
		const jsonFile = path.join(os.tmpdir(), `test-config-${Date.now()}.json`);
		process.env.JSON_TEST_KEY = "test_value";
		fs.writeFileSync(jsonFile, JSON.stringify({ setting: "${JSON_TEST_KEY}" }));
		const config = loadJsonConfig(jsonFile);
		expect(config.setting).toBe("test_value");
		fs.unlinkSync(jsonFile);
		delete process.env.JSON_TEST_KEY;
	});

	it("saveJsonConfig writes file", () => {
		const jsonFile = path.join(os.tmpdir(), `test-save-${Date.now()}.json`);
		const saved = saveJsonConfig({ test: true }, jsonFile);
		expect(fs.existsSync(saved)).toBe(true);
		const content = JSON.parse(fs.readFileSync(saved, "utf-8"));
		expect(content.test).toBe(true);
		fs.unlinkSync(saved);
	});
});
