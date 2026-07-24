import { randomUUID } from "node:crypto";
import { validateHyperframesSource } from "./source-security";
import type {
	HyperframesPreviewOptions,
	HyperframesVariableValue,
} from "./types";

export interface HyperframesDocumentSession {
	token: string;
	sourcePath: string;
	projectPath: string;
	html: string;
	variables: Record<string, HyperframesVariableValue>;
}

export class HyperframesSessionRegistry {
	private readonly sessions = new Map<string, HyperframesDocumentSession>();

	register({
		sourcePath,
		variables,
	}: HyperframesPreviewOptions): HyperframesDocumentSession {
		const source = validateHyperframesSource({ sourcePath });
		const session: HyperframesDocumentSession = {
			token: randomUUID(),
			...source,
			variables: { ...variables },
		};
		this.sessions.set(session.token, session);
		return session;
	}

	get({ token }: { token: string }): HyperframesDocumentSession | null {
		return this.sessions.get(token) ?? null;
	}

	release({ token }: { token: string }): boolean {
		return this.sessions.delete(token);
	}
}
