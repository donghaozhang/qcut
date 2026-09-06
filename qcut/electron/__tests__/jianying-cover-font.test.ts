// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPrivateCoverFont } from "../jianying-cover-font";

vi.mock("../jianying-font-lab-catalog", () => ({
	readFontkitMetadata: () => ({
		familyName: "Fixture",
		fullName: "Fixture",
		postscriptName: "Fixture",
		subfamilyName: "Regular",
	}),
	inspectJianyingFontBytes: ({
		entry,
		text,
	}: {
		entry: { fontId: string };
		text: string;
	}) => ({
		fontId: entry.fontId,
		covered: text === "ok",
		missing: text === "ok" ? [] : ["测"],
	}),
}));
vi.mock("../jianying-font-browser-compatibility", () => ({
	makeJianyingFontBrowserCompatible: ({ bytes }: { bytes: Buffer }) => bytes,
}));

let root: string;
const bytes = Buffer.from("fixture-font");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const fontId = `sha256:${sha256}`;
describe("private cover font access", () => {
	beforeEach(async () => {
		root = await mkdtemp(path.join(tmpdir(), "cover-font-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});
	it.each([
		"ttf",
		"otf",
	])("loads checksum-verified %s from the owned root", async (format) => {
		await writeFile(path.join(root, `${sha256}.${format}`), bytes);
		await expect(
			readPrivateCoverFont({ root, request: { fontId } })
		).resolves.toMatchObject({
			font: { fontId, format, sourceKinds: ["qcut-cache"] },
			bytes: [...bytes],
		});
		await expect(
			readPrivateCoverFont({ root, request: { fontId, text: "ok" } })
		).resolves.toMatchObject({ covered: true });
	});
	it.each([
		{ fontId: "../private" },
		{ fontId, path: "/outside/font.ttf" },
		{ fontId, text: "x".repeat(4097) },
	])("rejects unsupported requests", async (request) => {
		await expect(readPrivateCoverFont({ root, request })).rejects.toThrow();
	});
	it("rejects missing or corrupt fonts without local-system fallback", async () => {
		await expect(
			readPrivateCoverFont({ root, request: { fontId } })
		).rejects.toThrow("missing or checksum");
		await writeFile(path.join(root, `${sha256}.ttf`), "corrupt");
		await expect(
			readPrivateCoverFont({ root, request: { fontId } })
		).rejects.toThrow();
	});
});
