import type { ForeignDraftEnvelopeV1 } from "./foreign-envelope.js";

export const FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION = 1 as const;
export const FOREIGN_ENVELOPE_PAYLOAD_MAX_BYTES = 64 * 1024 * 1024;

export interface ForeignEnvelopePayloadEntryV1 {
	relativePath: string;
	bytesBase64: string;
}

export interface ForeignEnvelopePayloadV1 {
	schemaVersion: typeof FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION;
	entries: ForeignEnvelopePayloadEntryV1[];
}

export type ForeignEnvelopePayloadVerificationCode =
	| "PAYLOAD_TOO_LARGE"
	| "PAYLOAD_INVALID_UTF8"
	| "PAYLOAD_INVALID_JSON"
	| "PAYLOAD_MALFORMED"
	| "PAYLOAD_ENTRY_DUPLICATE"
	| "PAYLOAD_ENTRY_SET_MISMATCH"
	| "PAYLOAD_ENTRY_UNSUPPORTED_STORAGE"
	| "PAYLOAD_ENTRY_INVALID_BASE64"
	| "PAYLOAD_ENTRY_SIZE_MISMATCH"
	| "PAYLOAD_ENTRY_HASH_MISMATCH"
	| "PAYLOAD_CRYPTO_UNAVAILABLE";

export type VerifyForeignEnvelopePayloadResult =
	| {
			ok: true;
			payload: ForeignEnvelopePayloadV1;
			bytesByPath: ReadonlyMap<string, Uint8Array>;
	  }
	| {
			ok: false;
			code: ForeignEnvelopePayloadVerificationCode;
			message: string;
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: readonly string[];
}): boolean {
	const actual = Object.keys(record).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function parsePayload({ payloadBytes }: { payloadBytes: Uint8Array }):
	| { ok: true; payload: ForeignEnvelopePayloadV1 }
	| {
			ok: false;
			code: ForeignEnvelopePayloadVerificationCode;
			message: string;
	  } {
	let payloadText: string;
	try {
		payloadText = new TextDecoder("utf-8", { fatal: true }).decode(
			payloadBytes
		);
	} catch {
		return {
			ok: false,
			code: "PAYLOAD_INVALID_UTF8",
			message: "Foreign envelope payload is not valid UTF-8.",
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(payloadText);
	} catch {
		return {
			ok: false,
			code: "PAYLOAD_INVALID_JSON",
			message: "Foreign envelope payload is not valid JSON.",
		};
	}
	if (
		!isRecord(parsed) ||
		!hasExactKeys({ record: parsed, keys: ["schemaVersion", "entries"] }) ||
		parsed.schemaVersion !== FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION ||
		!Array.isArray(parsed.entries)
	) {
		return {
			ok: false,
			code: "PAYLOAD_MALFORMED",
			message: "Foreign envelope payload has an unsupported shape.",
		};
	}

	const entries: ForeignEnvelopePayloadEntryV1[] = [];
	const seenPaths = new Set<string>();
	for (const candidate of parsed.entries) {
		if (
			!isRecord(candidate) ||
			!hasExactKeys({
				record: candidate,
				keys: ["relativePath", "bytesBase64"],
			}) ||
			typeof candidate.relativePath !== "string" ||
			candidate.relativePath.length === 0 ||
			typeof candidate.bytesBase64 !== "string"
		) {
			return {
				ok: false,
				code: "PAYLOAD_MALFORMED",
				message: "Foreign envelope payload contains a malformed entry.",
			};
		}
		if (seenPaths.has(candidate.relativePath)) {
			return {
				ok: false,
				code: "PAYLOAD_ENTRY_DUPLICATE",
				message: `Foreign envelope payload repeats ${candidate.relativePath}.`,
			};
		}
		seenPaths.add(candidate.relativePath);
		entries.push({
			relativePath: candidate.relativePath,
			bytesBase64: candidate.bytesBase64,
		});
	}

	return {
		ok: true,
		payload: {
			schemaVersion: FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION,
			entries,
		},
	};
}

function decodeCanonicalBase64({
	value,
}: {
	value: string;
}): Uint8Array | null {
	if (
		value.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
			value
		)
	) {
		return null;
	}
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch {
		return null;
	}
}

async function sha256Hex({ bytes }: { bytes: Uint8Array }): Promise<string> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle === undefined) {
		throw new Error("WebCrypto is unavailable.");
	}
	const digest = await subtle.digest("SHA-256", bytes as BufferSource);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function verifyForeignEnvelopePayload({
	envelope,
	maximumPayloadBytes = FOREIGN_ENVELOPE_PAYLOAD_MAX_BYTES,
	payloadBytes,
}: {
	envelope: ForeignDraftEnvelopeV1;
	maximumPayloadBytes?: number;
	payloadBytes: Uint8Array;
}): Promise<VerifyForeignEnvelopePayloadResult> {
	if (
		!Number.isSafeInteger(maximumPayloadBytes) ||
		maximumPayloadBytes < 1 ||
		payloadBytes.byteLength > maximumPayloadBytes
	) {
		return {
			ok: false,
			code: "PAYLOAD_TOO_LARGE",
			message: "Foreign envelope payload exceeds the configured byte limit.",
		};
	}

	const parsed = parsePayload({ payloadBytes });
	if (!parsed.ok) return parsed;
	if (
		parsed.payload.entries.length !== envelope.entries.length ||
		parsed.payload.entries.some(
			(entry, index) =>
				entry.relativePath !== envelope.entries[index]?.relativePath
		)
	) {
		return {
			ok: false,
			code: "PAYLOAD_ENTRY_SET_MISMATCH",
			message: "Foreign envelope payload entries do not match its metadata.",
		};
	}

	const bytesByPath = new Map<string, Uint8Array>();
	for (const [index, payloadEntry] of parsed.payload.entries.entries()) {
		const metadata = envelope.entries[index];
		if (metadata?.storage !== "raw") {
			return {
				ok: false,
				code: "PAYLOAD_ENTRY_UNSUPPORTED_STORAGE",
				message: `Foreign envelope entry ${payloadEntry.relativePath} uses unsupported storage.`,
			};
		}
		const bytes = decodeCanonicalBase64({ value: payloadEntry.bytesBase64 });
		if (bytes === null) {
			return {
				ok: false,
				code: "PAYLOAD_ENTRY_INVALID_BASE64",
				message: `Foreign envelope entry ${payloadEntry.relativePath} is not canonical base64.`,
			};
		}
		if (bytes.byteLength !== metadata.byteLength) {
			return {
				ok: false,
				code: "PAYLOAD_ENTRY_SIZE_MISMATCH",
				message: `Foreign envelope entry ${payloadEntry.relativePath} has the wrong byte length.`,
			};
		}
		let digest: string;
		try {
			digest = await sha256Hex({ bytes });
		} catch {
			return {
				ok: false,
				code: "PAYLOAD_CRYPTO_UNAVAILABLE",
				message: "WebCrypto is required to verify a foreign envelope payload.",
			};
		}
		if (digest !== metadata.sha256) {
			return {
				ok: false,
				code: "PAYLOAD_ENTRY_HASH_MISMATCH",
				message: `Foreign envelope entry ${payloadEntry.relativePath} failed SHA-256 verification.`,
			};
		}
		bytesByPath.set(payloadEntry.relativePath, bytes);
	}

	return { ok: true, payload: parsed.payload, bytesByPath };
}
