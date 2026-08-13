import type {
	QCutJianyingProjectImportRequest,
	QCutJianyingProjectImportResult,
} from "../../types/qcut-jianying-project-import-api.js";
import { parseQCutJianyingProjectImportRequest } from "../../types/qcut-jianying-project-import-validation.js";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

export const JIANYING_PROJECT_IMPORT_ROUTE_PATH =
	"/api/claude/interop/jianying-project-import";
export const JIANYING_PROJECT_IMPORT_ROUTE_TIMEOUT_MS = 30 * 60 * 1000;

export function registerQCutJianyingProjectImportRoutes(
	router: Router,
	options: {
		requestImport: (
			request: QCutJianyingProjectImportRequest
		) => Promise<QCutJianyingProjectImportResult>;
		timeoutMs?: number;
	}
): void {
	router.post(JIANYING_PROJECT_IMPORT_ROUTE_PATH, async (req) => {
		let request: QCutJianyingProjectImportRequest;
		try {
			request = parseQCutJianyingProjectImportRequest({ value: req.body });
		} catch (error) {
			throw new HttpError(
				400,
				error instanceof Error
					? error.message
					: "Invalid Jianying project import request."
			);
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				options.requestImport(request),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() =>
							reject(new HttpError(504, "Renderer Jianying import timed out.")),
						options.timeoutMs ?? JIANYING_PROJECT_IMPORT_ROUTE_TIMEOUT_MS
					);
				}),
			]);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	});
}
