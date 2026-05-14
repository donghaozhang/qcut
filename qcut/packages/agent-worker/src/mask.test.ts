import { describe, expect, it } from "vitest";
import { mask } from "./mask";

describe("mask", () => {
	it("redacts OpenAI-style keys", () => {
		const line = 'set OPENAI_API_KEY=sk-abc123DEF456ghi789JKL012mno345PQR';
		expect(mask(line)).not.toContain("sk-abc123DEF");
		expect(mask(line)).toContain("***");
	});

	it("redacts JWTs", () => {
		const jwt =
			"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
		expect(mask(jwt)).not.toContain("eyJhbGciOi");
		expect(mask(jwt)).toContain("***");
	});

	it("redacts AWS access keys", () => {
		const line = "aws sts get-caller-identity --access-key AKIAIOSFODNN7EXAMPLE";
		expect(mask(line)).toContain("***");
		expect(mask(line)).not.toContain("AKIAIOSF");
	});

	it("redacts Supabase PATs", () => {
		// Build the fixture dynamically so a 40-hex `sbp_` literal never
		// lives in source — GitHub's secret scanner flags such literals
		// even when they're obviously dummy.
		const hex = "0123456789abcdef".repeat(3).slice(0, 40);
		const fakePat = `${"sbp"}_${hex}`;
		const line = `SUPABASE_ACCESS_TOKEN=${fakePat}`;
		expect(mask(line)).toContain("***");
		expect(mask(line)).not.toContain(hex.slice(0, 8));
	});

	it("redacts xoxb Slack bot tokens", () => {
		const line = "slackbot token=xoxb-12345-67890-abcdefg";
		expect(mask(line)).toContain("***");
	});

	it("leaves non-secret-shaped text alone", () => {
		const line = "hello world, this line has no secrets";
		expect(mask(line)).toBe(line);
	});

	it("masks multiple matches in one line", () => {
		const line =
			"key1=sk-abcdefghijklmnopqrst1234 and key2=AKIAABCDEFGHIJKLMNOP and key3=ghp_1234567890abcdefghij1234567890ABCDEF";
		const m = mask(line);
		expect(m).not.toContain("sk-abcdefghi");
		expect(m).not.toContain("AKIAABCDE");
		expect(m).not.toContain("ghp_12345");
		// Three masks
		expect((m.match(/\*\*\*/g) ?? []).length).toBeGreaterThanOrEqual(3);
	});
});
