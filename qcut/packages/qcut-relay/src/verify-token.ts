/**
 * HS256 token verification — minimal, no jose dependency.
 *
 * Spawn Edge Function signs `{ session_id, exp }` with the same shared
 * secret. We verify on the relay before opening the PTY. Token never
 * goes back to Supabase — gate-keeping is split for hot-path speed.
 *
 * @module @qcut/relay/verify-token
 */

export interface RelayClaims {
	session_id: string;
}

export async function verifyToken({
	token,
	secret,
}: {
	token: string;
	secret: string;
}): Promise<RelayClaims> {
	const [headerB64, payloadB64, sigB64] = token.split(".");
	if (!headerB64 || !payloadB64 || !sigB64) {
		throw new Error("malformed_token");
	}

	const header = JSON.parse(b64decUtf8(headerB64));
	if (header.alg !== "HS256") {
		throw new Error("alg_mismatch");
	}

	const key = await globalThis.crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"]
	);
	const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	const sig = b64decBin(sigB64);
	const ok = await globalThis.crypto.subtle.verify("HMAC", key, sig, data);
	if (!ok) throw new Error("sig_mismatch");

	const payload = JSON.parse(b64decUtf8(payloadB64));
	if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
		throw new Error("expired");
	}
	if (typeof payload.session_id !== "string") {
		throw new Error("missing_session_id");
	}
	return { session_id: payload.session_id };
}

/** Peek `session_id` *without* verifying signature — only for routing
 * to the right Durable Object. The DO re-verifies. */
export function peekSessionId(token: string): string | null {
	try {
		const payloadB64 = token.split(".")[1];
		if (!payloadB64) return null;
		const json = JSON.parse(b64decUtf8(payloadB64));
		return typeof json.session_id === "string" ? json.session_id : null;
	} catch {
		return null;
	}
}

function b64decBin(s: string): Uint8Array {
	// Re-pad and convert URL-safe → standard base64
	const padded = s + (s.length % 4 === 0 ? "" : "====".slice(s.length % 4));
	const std = padded.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(std);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function b64decUtf8(s: string): string {
	return new TextDecoder().decode(b64decBin(s));
}
