/**
 * Renderer envelope adapter (JYI-011).
 *
 * Thin, typed wrapper over the main-process envelope key service. The
 * renderer never sees key material — only payload bytes over the trusted
 * bridge — and every call degrades to a typed unavailability result when
 * the bridge or the OS keychain is missing.
 *
 * @module lib/jianying-draft/envelope-key-adapter
 */

import type { JianyingEnvelopeAPI } from "@/types/electron/api-jianying-envelope";

export type EnvelopeAdapterResult<Value> =
	| { ok: true; value: Value }
	| { ok: false; code: string; message: string };

function getBridge(): JianyingEnvelopeAPI | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.electronAPI?.jianyingEnvelope ?? null;
}

const BRIDGE_MISSING: EnvelopeAdapterResult<never> = {
	ok: false,
	code: "bridge-unavailable",
	message: "envelope bridge is not exposed in this environment",
};

function fromDto<Value>(dto: {
	ok: boolean;
	value?: Value;
	error?: { code: string; message: string };
}): EnvelopeAdapterResult<Value> {
	if (dto.ok && dto.value !== undefined) {
		return { ok: true, value: dto.value };
	}
	return {
		ok: false,
		code: dto.error?.code ?? "envelope-io-failed",
		message: dto.error?.message ?? "envelope operation failed",
	};
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function storeEnvelopePayload({
	importId,
	payload,
}: {
	importId: string;
	payload: Uint8Array;
}): Promise<
	EnvelopeAdapterResult<{
		location: string;
		keyVersion: number;
		sha256: string;
	}>
> {
	const bridge = getBridge();
	if (bridge === null) return BRIDGE_MISSING;
	const dto = await bridge.store({
		importId,
		payloadBase64: bytesToBase64(payload),
	});
	if (!dto.ok) return fromDto(dto);
	return {
		ok: true,
		value: {
			location: dto.value.location,
			keyVersion: dto.value.keyVersion,
			sha256: dto.value.sha256,
		},
	};
}

export async function readEnvelopePayload({
	importId,
}: {
	importId: string;
}): Promise<
	EnvelopeAdapterResult<{ payload: Uint8Array; keyVersion: number }>
> {
	const bridge = getBridge();
	if (bridge === null) return BRIDGE_MISSING;
	const dto = await bridge.read({ importId });
	if (!dto.ok) return fromDto(dto);
	return {
		ok: true,
		value: {
			payload: base64ToBytes(dto.value.payloadBase64),
			keyVersion: dto.value.keyVersion,
		},
	};
}

export async function deleteEnvelopePayload({
	importId,
}: {
	importId: string;
}): Promise<EnvelopeAdapterResult<{ deleted: boolean }>> {
	const bridge = getBridge();
	if (bridge === null) return BRIDGE_MISSING;
	return fromDto(await bridge.delete({ importId }));
}

export async function purgeEnvelopes(): Promise<
	EnvelopeAdapterResult<{ purgedCount: number }>
> {
	const bridge = getBridge();
	if (bridge === null) return BRIDGE_MISSING;
	return fromDto(await bridge.purge());
}

export async function getEnvelopeServiceStatus(): Promise<
	EnvelopeAdapterResult<{
		keychainAvailable: boolean;
		keyVersion: number;
		storedCount: number;
	}>
> {
	const bridge = getBridge();
	if (bridge === null) return BRIDGE_MISSING;
	return fromDto(await bridge.status());
}
