export function createPersonCutoutAbortError() {
	const error = new Error("人物抠像已取消");
	error.name = "AbortError";
	return error;
}

export function throwIfPersonCutoutAborted({
	signal,
}: {
	signal?: AbortSignal;
}) {
	if (signal?.aborted) throw createPersonCutoutAbortError();
}

export function waitForPersonCutoutPromise<Result>({
	promise,
	signal,
}: {
	promise: Promise<Result>;
	signal?: AbortSignal;
}): Promise<Result> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(createPersonCutoutAbortError());
	return new Promise<Result>((resolve, reject) => {
		let settled = false;
		const cleanup = () => signal.removeEventListener("abort", abort);
		const finish = ({
			error,
			kind,
			value,
		}:
			| { kind: "rejected"; error: unknown; value?: never }
			| { kind: "resolved"; error?: never; value: Result }) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (kind === "rejected") {
				reject(error);
				return;
			}
			resolve(value);
		};
		const abort = () =>
			finish({ kind: "rejected", error: createPersonCutoutAbortError() });
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => finish({ kind: "resolved", value }),
			(error: unknown) => finish({ kind: "rejected", error })
		);
	});
}
