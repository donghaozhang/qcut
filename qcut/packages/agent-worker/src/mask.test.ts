import { describe, expect, it } from "vitest";
import { mask } from "./mask";

// All fixtures below build their secret-shaped tokens at runtime by
// concatenating fragments. Scanning tools (GitHub secret scanning, etc.)
// match on byte sequences in source — never let a complete `sk-…`,
// `eyJ…`, `AKIA…`, `xoxb-…`, `ghp_…` literal exist in this file.

describe("mask", () => {
	it("redacts OpenAI-style keys", () => {
		const prefix = `${"sk"}-`;
		const body = "abc123DEF456ghi789JKL012mno345PQR";
		const token = `${prefix}${body}`;
		const line = `set OPENAI_API_KEY=${token}`;
		expect(mask(line)).not.toContain(body.slice(0, 12));
		expect(mask(line)).toContain("***");
	});

	it("redacts JWTs", () => {
		const header = `${"eyJ"}hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`;
		const payload = `${"eyJ"}zdWIiOiIxMjM0NTY3ODkwIn0`;
		const sig = "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
		const jwt = `Authorization: Bearer ${header}.${payload}.${sig}`;
		expect(mask(jwt)).not.toContain(header.slice(0, 10));
		expect(mask(jwt)).toContain("***");
	});

	it("redacts AWS access keys", () => {
		const token = `${"AKIA"}IOSFODNN7EXAMPLE`;
		const line = `aws sts get-caller-identity --access-key ${token}`;
		expect(mask(line)).toContain("***");
		expect(mask(line)).not.toContain(token.slice(0, 8));
	});

	it("redacts Supabase PATs", () => {
		// 40-hex body for the `sbp_<40 hex>` shape.
		const hex = "0123456789abcdef".repeat(3).slice(0, 40);
		const fakePat = `${"sbp"}_${hex}`;
		const line = `SUPABASE_ACCESS_TOKEN=${fakePat}`;
		expect(mask(line)).toContain("***");
		expect(mask(line)).not.toContain(hex.slice(0, 8));
	});

	it("redacts xoxb Slack bot tokens", () => {
		const token = `${"xoxb"}-12345-67890-abcdefg`;
		const line = `slackbot token=${token}`;
		expect(mask(line)).toContain("***");
	});

	it("leaves non-secret-shaped text alone", () => {
		const line = "hello world, this line has no secrets";
		expect(mask(line)).toBe(line);
	});

	it("masks multiple matches in one line", () => {
		const openai = `${"sk"}-abcdefghijklmnopqrst1234`;
		const aws = `${"AKIA"}ABCDEFGHIJKLMNOP`;
		const ghp = `${"ghp"}_1234567890abcdefghij1234567890ABCDEF`;
		const line = `key1=${openai} and key2=${aws} and key3=${ghp}`;
		const m = mask(line);
		expect(m).not.toContain(openai.slice(0, 12));
		expect(m).not.toContain(aws.slice(0, 8));
		expect(m).not.toContain(ghp.slice(0, 8));
		// Three masks
		expect((m.match(/\*\*\*/g) ?? []).length).toBeGreaterThanOrEqual(3);
	});
});
