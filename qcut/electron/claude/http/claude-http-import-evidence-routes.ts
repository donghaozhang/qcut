import type { QCutPersistedImportEvidenceSnapshot } from "../../types/qcut-import-evidence-api.js";
import { parseQCutPersistedImportEvidenceRequest } from "../../types/qcut-import-evidence-validation.js";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

const ROUTE_TIMEOUT_MS = 30 * 60 * 1000;

export function registerQCutImportEvidenceRoutes(
	router: Router,
	options: {
		requestSnapshot: (
			request: ReturnType<typeof parseQCutPersistedImportEvidenceRequest>
		) => Promise<QCutPersistedImportEvidenceSnapshot>;
		timeoutMs?: number;
	}
): void {
	router.post("/api/claude/interop/import-snapshot", async (req) => {
		let request: ReturnType<typeof parseQCutPersistedImportEvidenceRequest>;
		try {
			request = parseQCutPersistedImportEvidenceRequest({ value: req.body });
		} catch (error) {
			throw new HttpError(
				400,
				error instanceof Error
					? error.message
					: "Invalid import evidence request."
			);
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				options.requestSnapshot(request),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(
								new HttpError(504, "Renderer evidence capture timed out.")
							),
						options.timeoutMs ?? ROUTE_TIMEOUT_MS
					);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	});
}
