import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateFontAPI } from "../private-font-api";

const fontId = `sha256:${"a".repeat(64)}`;
const fetchMock = vi.fn();
describe("private cover development fonts", () => {
	beforeEach(() => {
		window.electronAPI = undefined;
		vi.stubEnv("DEV", true);
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockReset();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		window.electronAPI = undefined;
	});
	it("does not expose a localhost fallback in production", () => {
		vi.stubEnv("DEV", false);
		expect(privateFontAPI()).toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("prefers the existing Electron font laboratory", () => {
		const api = { load: vi.fn(), inspect: vi.fn() };
		window.electronAPI = { jianyingFontLab: api } as never;
		expect(privateFontAPI()).toBe(api);
	});
	it("converts validated same-origin font bytes to Uint8Array", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ font: { fontId }, bytes: [0, 1, 255] })
		);
		const result = await privateFontAPI()?.load({ fontId });
		expect(result?.bytes).toEqual(new Uint8Array([0, 1, 255]));
		expect(fetchMock).toHaveBeenCalledWith(
			"/__qcut/private-covers/font",
			expect.objectContaining({ method: "POST", cache: "no-store" })
		);
	});
	it.each([
		{ font: { fontId: "other" }, bytes: [1] },
		{ font: { fontId }, bytes: [256] },
		{ font: { fontId }, bytes: [] },
		{ font: { fontId }, bytes: [1.5] },
	])("rejects malformed font identity or bytes", async (value) => {
		fetchMock.mockResolvedValue(Response.json(value));
		await expect(privateFontAPI()?.load({ fontId })).rejects.toThrow(
			"Invalid private font"
		);
	});
	it("validates glyph coverage identity", async () => {
		fetchMock.mockResolvedValue(
			Response.json({ fontId: "other", covered: true, missing: [] })
		);
		await expect(
			privateFontAPI()?.inspect({ fontId, text: "测试" })
		).rejects.toThrow("Invalid private font coverage");
	});
});
