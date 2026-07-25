export interface HyperframesOutputSession {
	sessionId: string;
	outputPath: string;
	browserOutputPath: string;
	sessionDirectory: string;
}

export class HyperframesOutputRegistry {
	private readonly sessions = new Map<string, HyperframesOutputSession>();

	register({ session }: { session: HyperframesOutputSession }): void {
		this.sessions.set(session.sessionId, session);
	}

	get({ sessionId }: { sessionId: string }): HyperframesOutputSession | null {
		return this.sessions.get(sessionId) ?? null;
	}

	release({
		sessionId,
	}: {
		sessionId: string;
	}): HyperframesOutputSession | null {
		const session = this.sessions.get(sessionId) ?? null;
		this.sessions.delete(sessionId);
		return session;
	}
}

export const hyperframesOutputRegistry = new HyperframesOutputRegistry();
