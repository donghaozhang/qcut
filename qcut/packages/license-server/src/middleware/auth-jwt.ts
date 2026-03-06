interface JwtHeader {
	alg?: unknown;
	typ?: unknown;
}

interface JwtPayload {
	sub?: unknown;
	userId?: unknown;
	exp?: unknown;
	nbf?: unknown;
}

/** Encodes raw bytes as base64 across browser and Node runtimes. */
function toBase64FromBytes({ bytes }: { bytes: Uint8Array }): string {
	try {
		const btoaFn = (globalThis as { btoa?: (value: string) => string }).btoa;
		if (typeof btoaFn === "function") {
			let binary = "";
			for (const byte of bytes) {
				binary += String.fromCharCode(byte);
			}
			return btoaFn(binary);
		}

		return Buffer.from(bytes).toString("base64");
	} catch {
		return "";
	}
}

/** Decodes a base64 string into bytes across browser and Node runtimes. */
function fromBase64ToBytes({ base64 }: { base64: string }): Uint8Array | null {
	try {
		const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
		if (typeof atobFn === "function") {
			const binary = atobFn(base64);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index += 1) {
				bytes[index] = binary.charCodeAt(index);
			}
			return bytes;
		}

		return new Uint8Array(Buffer.from(base64, "base64"));
	} catch {
		return null;
	}
}

/** Converts a base64 string into the JWT-safe base64url form. */
function toBase64Url({ value }: { value: string }): string {
	return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Restores padding and alphabet from a base64url segment. */
function fromBase64Url({ value }: { value: string }): string {
	const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
	return padded.replace(/-/g, "+").replace(/_/g, "/");
}

/** Decodes a base64url segment into UTF-8 text. */
function decodeBase64UrlToString({ value }: { value: string }): string | null {
	try {
		const base64 = fromBase64Url({ value });
		const bytes = fromBase64ToBytes({ base64 });
		if (!bytes) {
			return null;
		}

		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

/** Compares equal-length signatures without early exit. */
function constantTimeEqual({
	left,
	right,
}: {
	left: string;
	right: string;
}): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

/** Reads numeric JWT claims only when they are finite. */
function parseNumericClaim({ claim }: { claim: unknown }): number | null {
	if (typeof claim !== "number" || !Number.isFinite(claim)) {
		return null;
	}
	return claim;
}

/** Signs a JWT message with HS256. */
async function signHs256({
	input,
	secret,
}: {
	input: string;
	secret: string;
}): Promise<string | null> {
	try {
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
		const signatureBase64 = toBase64FromBytes({
			bytes: new Uint8Array(signature),
		});
		if (!signatureBase64) {
			return null;
		}
		return toBase64Url({ value: signatureBase64 });
	} catch {
		return null;
	}
}

/** Prefers sub and falls back to userId for legacy tokens. */
function extractUserIdFromPayload({
	payload,
}: {
	payload: JwtPayload;
}): string | null {
	if (typeof payload.sub === "string" && payload.sub.trim().length > 0) {
		return payload.sub;
	}
	if (typeof payload.userId === "string" && payload.userId.trim().length > 0) {
		return payload.userId;
	}
	return null;
}

/** Validates an HS256 JWT and returns its user identifier. */
export async function verifyJwtAndExtractUserId({
	token,
	secret,
	nowMs,
}: {
	token: string;
	secret: string;
	nowMs?: number;
}): Promise<string | null> {
	try {
		if (typeof token !== "string" || token.trim().length === 0) {
			return null;
		}
		if (typeof secret !== "string" || secret.trim().length === 0) {
			return null;
		}

		const tokenParts = token.split(".");
		if (tokenParts.length !== 3) {
			return null;
		}

		const [encodedHeader, encodedPayload, signature] = tokenParts;
		if (
			encodedHeader.length === 0 ||
			encodedPayload.length === 0 ||
			signature.length === 0
		) {
			return null;
		}

		const headerRaw = decodeBase64UrlToString({ value: encodedHeader });
		const payloadRaw = decodeBase64UrlToString({ value: encodedPayload });
		if (!headerRaw || !payloadRaw) {
			return null;
		}

		const header = JSON.parse(headerRaw) as JwtHeader;
		if (header.alg !== "HS256") {
			return null;
		}

		const expectedSignature = await signHs256({
			input: `${encodedHeader}.${encodedPayload}`,
			secret,
		});
		if (!expectedSignature) {
			return null;
		}

		if (!constantTimeEqual({ left: signature, right: expectedSignature })) {
			return null;
		}

		const payload = JSON.parse(payloadRaw) as JwtPayload;
		const nowSeconds = Math.floor((nowMs ?? Date.now()) / 1000);
		const expiresAt = parseNumericClaim({ claim: payload.exp });
		if (expiresAt !== null && expiresAt <= nowSeconds) {
			return null;
		}

		const notBefore = parseNumericClaim({ claim: payload.nbf });
		if (notBefore !== null && nowSeconds < notBefore) {
			return null;
		}

		return extractUserIdFromPayload({ payload });
	} catch {
		return null;
	}
}
