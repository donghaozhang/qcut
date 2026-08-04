import type {
	QCutSameProfileWritebackRequest,
	QCutSameProfileWritebackResult,
} from "../../types/qcut-same-profile-writeback-api.js";
import { parseQCutSameProfileWritebackRequest } from "../../types/qcut-same-profile-writeback-validation.js";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

const ROUTE_TIMEOUT_MS = 30 * 60 * 1000;

export function registerQCutSameProfileWritebackRoutes(
	router: Router,
	options: {
		requestOperation: (
			request: QCutSameProfileWritebackRequest
		) => Promise<QCutSameProfileWritebackResult>;
		timeoutMs?: number;
	}
): void {
	router.post("/api/claude/interop/writeback", async (req) => {
		let request: QCutSameProfileWritebackRequest;
		try {
			request = parseQCutSameProfileWritebackRequest({ value: req.body });
		} catch (error) {
			throw new HttpError(
				400,
				error instanceof Error
					? error.message
					: "Invalid same-profile writeback request."
			);
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				options.requestOperation(request),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(new HttpError(504, "Renderer draft writeback timed out.")),
						options.timeoutMs ?? ROUTE_TIMEOUT_MS
					);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	});
}
