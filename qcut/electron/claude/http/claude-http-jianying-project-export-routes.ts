import type {
	QCutJianyingProjectExportRequest,
	QCutJianyingProjectExportResult,
} from "../../types/qcut-jianying-project-export-api.js";
import { parseQCutJianyingProjectExportRequest } from "../../types/qcut-jianying-project-export-validation.js";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

const ROUTE_TIMEOUT_MS = 30 * 60 * 1000;

export function registerQCutJianyingProjectExportRoutes(
	router: Router,
	options: {
		requestExport: (
			request: QCutJianyingProjectExportRequest
		) => Promise<QCutJianyingProjectExportResult>;
		timeoutMs?: number;
	}
): void {
	router.post("/api/claude/interop/jianying-project-export", async (req) => {
		let request: QCutJianyingProjectExportRequest;
		try {
			request = parseQCutJianyingProjectExportRequest({ value: req.body });
		} catch (error) {
			throw new HttpError(
				400,
				error instanceof Error
					? error.message
					: "Invalid Jianying project export request."
			);
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				options.requestExport(request),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(new HttpError(504, "Renderer Jianying export timed out.")),
						options.timeoutMs ?? ROUTE_TIMEOUT_MS
					);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	});
}
