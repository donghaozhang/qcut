import { LICENSE_SERVER_URL } from "@/lib/ai-video/core/license-relay";
import type { UserLibraryNamespace } from "./user-library-events";

export interface CloudUserLibraryDocument {
	documentKey: string;
	namespace: UserLibraryNamespace;
	payload: unknown;
	updatedAt: string;
	version: number;
}

interface LibraryDocumentsResponse {
	documents?: CloudUserLibraryDocument[];
	error?: string;
}

interface PutLibraryDocumentResponse {
	conflict?: boolean;
	current?: CloudUserLibraryDocument | null;
	document?: CloudUserLibraryDocument;
	error?: string;
}

export class UserLibraryConflictError extends Error {
	readonly current: CloudUserLibraryDocument | null;

	constructor({ current }: { current: CloudUserLibraryDocument | null }) {
		super("User library changed on another device");
		this.name = "UserLibraryConflictError";
		this.current = current;
	}
}

async function responseJson<T>({
	response,
}: {
	response: Response;
}): Promise<T> {
	return (await response.json()) as T;
}

export async function fetchUserLibraryDocument({
	namespace,
	documentKey,
	sessionToken,
	signal,
}: {
	namespace: UserLibraryNamespace;
	documentKey: string;
	sessionToken: string;
	signal?: AbortSignal;
}): Promise<CloudUserLibraryDocument | null> {
	const url = new URL(`${LICENSE_SERVER_URL}/api/library`);
	url.searchParams.set("namespace", namespace);
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${sessionToken}` },
		signal,
	});
	const body = await responseJson<LibraryDocumentsResponse>({ response });
	if (!response.ok)
		throw new Error(body.error ?? "Failed to load cloud library");
	return (
		body.documents?.find((document) => document.documentKey === documentKey) ??
		null
	);
}

export async function putUserLibraryDocument({
	namespace,
	documentKey,
	payload,
	baseVersion,
	sessionToken,
	signal,
}: {
	namespace: UserLibraryNamespace;
	documentKey: string;
	payload: unknown;
	baseVersion: number;
	sessionToken: string;
	signal?: AbortSignal;
}): Promise<CloudUserLibraryDocument> {
	const response = await fetch(`${LICENSE_SERVER_URL}/api/library/documents`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${sessionToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ namespace, documentKey, payload, baseVersion }),
		signal,
	});
	const body = await responseJson<PutLibraryDocumentResponse>({ response });
	if (response.status === 409) {
		throw new UserLibraryConflictError({ current: body.current ?? null });
	}
	if (!response.ok || !body.document) {
		throw new Error(body.error ?? "Failed to update cloud library");
	}
	return body.document;
}
