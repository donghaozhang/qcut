export interface DisposablePortraitTrackingSession {
	process: { dispose: () => Promise<void> };
}

export interface PortraitTrackingScope<
	Session extends DisposablePortraitTrackingSession,
> {
	sessions: Map<string, Session>;
	lastTimestampSeconds: number | null;
}

export function createPortraitTrackingScopePool<
	Session extends DisposablePortraitTrackingSession,
>({ limit }: { limit: number }) {
	const maximumScopes = Math.max(1, Math.floor(limit));
	const scopes = new Map<string, PortraitTrackingScope<Session>>();

	const retire = async ({ scopeKey }: { scopeKey: string }) => {
		const scope = scopes.get(scopeKey);
		if (!scope) return;
		scopes.delete(scopeKey);
		const active = [...scope.sessions.values()];
		scope.sessions.clear();
		await Promise.all(active.map((session) => session.process.dispose()));
	};

	const acquire = async ({ scopeKey }: { scopeKey: string }) => {
		const existing = scopes.get(scopeKey);
		if (existing) {
			scopes.delete(scopeKey);
			scopes.set(scopeKey, existing);
			return existing;
		}

		if (scopes.size >= maximumScopes) {
			const oldestScopeKey = scopes.keys().next().value;
			if (oldestScopeKey) await retire({ scopeKey: oldestScopeKey });
		}
		const created: PortraitTrackingScope<Session> = {
			sessions: new Map(),
			lastTimestampSeconds: null,
		};
		scopes.set(scopeKey, created);
		return created;
	};

	const clear = async () => {
		const active = [...scopes.values()].flatMap((scope) => [
			...scope.sessions.values(),
		]);
		scopes.clear();
		await Promise.all(active.map((session) => session.process.dispose()));
	};

	return { acquire, clear, retire };
}
