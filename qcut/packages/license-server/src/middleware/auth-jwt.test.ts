import { describe, expect, it } from "vitest";
import { verifyJwtAndExtractUserId } from "./auth-jwt";

const TEST_SECRET = "test-secret";

function toBase64UrlFromBytes({ bytes }: { bytes: Uint8Array }): string {
	const base64 = Buffer.from(bytes).toString("base64");
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signHs256({
	input,
	secret,
}: {
	input: string;
	secret: string;
}): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(input)
	);
	return toBase64UrlFromBytes({ bytes: new Uint8Array(signature) });
}

function encodeObjectToBase64Url({ value }: { value: Record<string, unknown> }): string {
	const json = JSON.stringify(value);
	const base64 = Buffer.from(json, "utf-8").toString("base64");
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function buildJwt({
	header,
	payload,
	secret,
}: {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
	secret: string;
}): Promise<string> {
	const encodedHeader = encodeObjectToBase64Url({ value: header });
	const encodedPayload = encodeObjectToBase64Url({ value: payload });
	const signature = await signHs256({
		input: `${encodedHeader}.${encodedPayload}`,
		secret,
	});
	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe("verifyJwtAndExtractUserId", () => {
	it("returns sub for a valid HS256 token", async () => {
		const token = await buildJwt({
			header: { alg: "HS256", typ: "JWT" },
			payload: { sub: "user-123", exp: Math.floor(Date.now() / 1000) + 300 },
			secret: TEST_SECRET,
		});

		const result = await verifyJwtAndExtractUserId({
			token,
			secret: TEST_SECRET,
		});
		expect(result).toBe("user-123");
	});

	it("rejects tampered payloads", async () => {
		const token = await buildJwt({
			header: { alg: "HS256", typ: "JWT" },
			payload: { sub: "user-123", exp: Math.floor(Date.now() / 1000) + 300 },
			secret: TEST_SECRET,
		});
		const [header, _payload, signature] = token.split(".");
		const tamperedPayload = encodeObjectToBase64Url({
			value: { sub: "user-evil", exp: Math.floor(Date.now() / 1000) + 300 },
		});
		const tampered = `${header}.${tamperedPayload}.${signature}`;

		const result = await verifyJwtAndExtractUserId({
			token: tampered,
			secret: TEST_SECRET,
		});
		expect(result).toBeNull();
	});

	it("rejects expired tokens", async () => {
		const token = await buildJwt({
			header: { alg: "HS256", typ: "JWT" },
			payload: { sub: "user-123", exp: Math.floor(Date.now() / 1000) - 10 },
			secret: TEST_SECRET,
		});

		const result = await verifyJwtAndExtractUserId({
			token,
			secret: TEST_SECRET,
		});
		expect(result).toBeNull();
	});

	it("rejects non-HS256 algorithms", async () => {
		const token = await buildJwt({
			header: { alg: "none", typ: "JWT" },
			payload: { sub: "user-123" },
			secret: TEST_SECRET,
		});

		const result = await verifyJwtAndExtractUserId({
			token,
			secret: TEST_SECRET,
		});
		expect(result).toBeNull();
	});
});
