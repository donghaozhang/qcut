import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";

import { peekSessionId, verifyToken } from "./verify-token";

const SECRET = "test_secret_long_enough_for_hmac_256";
const SECRET_BYTES = new TextEncoder().encode(SECRET);

async function makeToken(opts: {
	session_id?: string;
	expIn?: string;
	secret?: Uint8Array;
}): Promise<string> {
	const claims: Record<string, unknown> = {};
	if (opts.session_id !== undefined) claims.session_id = opts.session_id;
	return await new SignJWT(claims)
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(opts.expIn ?? "5m")
		.sign(opts.secret ?? SECRET_BYTES);
}

describe("verifyToken", () => {
	it("accepts a fresh, correctly-signed token", async () => {
		const t = await makeToken({ session_id: "abc-123" });
		const claims = await verifyToken(t, SECRET);
		expect(claims.session_id).toBe("abc-123");
	});

	it("rejects a token signed with the wrong secret", async () => {
		const t = await makeToken({
			session_id: "abc",
			secret: new TextEncoder().encode("wrong_secret"),
		});
		await expect(verifyToken(t, SECRET)).rejects.toThrow("sig_mismatch");
	});

	it("rejects an expired token", async () => {
		const t = await makeToken({ session_id: "abc", expIn: "1s" });
		await new Promise((r) => setTimeout(r, 1500));
		await expect(verifyToken(t, SECRET)).rejects.toThrow("expired");
	});

	it("rejects a token missing session_id", async () => {
		const t = await makeToken({}); // no session_id claim
		await expect(verifyToken(t, SECRET)).rejects.toThrow("missing_session_id");
	});

	it("rejects malformed input", async () => {
		await expect(verifyToken("not.a.jwt", SECRET)).rejects.toThrow();
		await expect(verifyToken("", SECRET)).rejects.toThrow();
		await expect(verifyToken("only-one-part", SECRET)).rejects.toThrow(
			"malformed_token",
		);
	});

	it("rejects non-HS256 alg", async () => {
		// Hand-craft a structurally valid 3-segment token with a
		// non-HS256 header. Signature is arbitrary base64 — verifyToken
		// short-circuits on alg before reaching sig check.
		const b64url = (s: string) =>
			btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
		const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
		const payload = b64url(JSON.stringify({ session_id: "abc" }));
		const fakeToken = `${header}.${payload}.AAAA`;
		await expect(verifyToken(fakeToken, SECRET)).rejects.toThrow("alg_mismatch");
	});
});

describe("peekSessionId", () => {
	it("decodes payload without verifying signature", async () => {
		const t = await makeToken({ session_id: "peek-test" });
		expect(peekSessionId(t)).toBe("peek-test");
	});

	it("works on tampered tokens (intentional — DO re-verifies)", async () => {
		const t = await makeToken({ session_id: "x" });
		const parts = t.split(".");
		// Replace signature with garbage
		const tampered = `${parts[0]}.${parts[1]}.AAAA`;
		expect(peekSessionId(tampered)).toBe("x");
	});

	it("returns null for malformed", () => {
		expect(peekSessionId("not.a.token")).toBeNull();
		expect(peekSessionId("")).toBeNull();
		expect(peekSessionId("only-one-part")).toBeNull();
	});
});
