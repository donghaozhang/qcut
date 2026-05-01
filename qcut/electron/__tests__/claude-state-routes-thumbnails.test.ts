/**
 * Pins the query-string contract for `editor:state:snapshot`'s new
 * `media.includeThumbnails` flag.
 *
 * The CLI wraps this as `--with-thumbnails` (see cli-handlers-editor.ts);
 * here we test the pure parser so no live HTTP/Electron is required.
 */

import { describe, expect, it } from "vitest";
import { parseStateRequestFromQuery } from "../claude/http/claude-http-state-routes";

describe("parseStateRequestFromQuery", () => {
	it("returns undefined when no flags are set (no fetch needed)", () => {
		expect(parseStateRequestFromQuery({})).toBeUndefined();
	});

	it("default state snapshot does NOT enable thumbnails", () => {
		const req = parseStateRequestFromQuery({ include: "media" });
		expect(req?.media?.includeThumbnails).toBeUndefined();
	});

	it("media.includeThumbnails=1 turns the flag on", () => {
		const req = parseStateRequestFromQuery({
			include: "media",
			mediaIncludeThumbnails: "1",
		});
		expect(req?.media?.includeThumbnails).toBe(true);
		expect(req?.include).toContain("media");
	});

	it("media.includeThumbnails=true turns the flag on (case-insensitive)", () => {
		const req = parseStateRequestFromQuery({
			include: "media",
			mediaIncludeThumbnails: "TRUE",
		});
		expect(req?.media?.includeThumbnails).toBe(true);
	});

	it("media.includeThumbnails works without --include (returns just the media flag)", () => {
		const req = parseStateRequestFromQuery({
			mediaIncludeThumbnails: "1",
		});
		expect(req?.include).toBeUndefined();
		expect(req?.media?.includeThumbnails).toBe(true);
	});

	it("does not turn the flag on for unrecognized values", () => {
		const req = parseStateRequestFromQuery({
			include: "media",
			mediaIncludeThumbnails: "maybe",
		});
		expect(req?.media?.includeThumbnails).toBeUndefined();
	});

	it("rejects invalid include section with HTTP 400", () => {
		expect(() =>
			parseStateRequestFromQuery({ include: "garbage" })
		).toThrow(/Invalid include section/);
	});

	it("dedupes repeated include sections", () => {
		const req = parseStateRequestFromQuery({
			include: "media,media,timeline",
		});
		expect(req?.include).toEqual(["media", "timeline"]);
	});
});
