import { ipcMain } from "electron";
import {
	JIANYING_TEXT_RUNTIME_CANCEL_CHANNEL,
	JIANYING_TEXT_RUNTIME_INSPECT_CHANNEL,
	JIANYING_TEXT_RUNTIME_RENDER_CHANNEL,
	type JianyingTextRuntimeInspectRequest,
	type JianyingTextRuntimeRenderRequest,
	type JianyingTextRuntimeStatus,
} from "./jianying-text-runtime-contract.js";
import {
	JianyingTextPackageError,
	resolveJianyingTextPackage,
} from "./jianying-text-runtime/package-resolver.js";
import { normalizeJianyingTextRuntimeReference } from "./jianying-text-runtime/reference.js";
import { cancelJianyingTextRender } from "./jianying-text-runtime/render-process.js";
import { renderJianyingText } from "./jianying-text-runtime/render.js";
import { inspectJianyingTextRuntime } from "./jianying-text-runtime/runtime-discovery.js";

export interface JianyingTextRuntimeIPCController {
	dispose: () => void;
}

function statusWithPackage({
	status,
	state,
	message,
	packageReady,
	resourceId,
	packageHash,
	templateDuration,
	missingDependencies,
}: {
	status: JianyingTextRuntimeStatus;
	state: JianyingTextRuntimeStatus["state"];
	message: string;
	packageReady: boolean;
	resourceId?: string;
	packageHash?: string;
	templateDuration?: number;
	missingDependencies?: JianyingTextRuntimeStatus["missingDependencies"];
}): JianyingTextRuntimeStatus {
	return {
		...status,
		state,
		message,
		packageReady,
		...(resourceId ? { resourceId } : {}),
		...(packageHash ? { packageHash } : {}),
		...(templateDuration ? { templateDuration } : {}),
		...(missingDependencies ? { missingDependencies } : {}),
	};
}

async function inspectReference({
	request,
}: {
	request?: JianyingTextRuntimeInspectRequest;
}) {
	const inspection = await inspectJianyingTextRuntime();
	if (inspection.status.state !== "ready" || !request?.reference) {
		return inspection.status;
	}
	const reference = normalizeJianyingTextRuntimeReference({
		value: request.reference,
	});
	if (!reference) {
		return statusWithPackage({
			status: inspection.status,
			state: "package-invalid",
			message: "项目中的剪映花字引用格式无效。",
			packageReady: false,
		});
	}
	try {
		const packageInfo = await resolveJianyingTextPackage({ reference });
		return statusWithPackage({
			status: inspection.status,
			state: "ready",
			message: "剪映原版动态花字资源与本机运行时均已就绪。",
			packageReady: true,
			resourceId: packageInfo.resourceId,
			packageHash: packageInfo.packageHash,
			templateDuration: packageInfo.templateDuration,
		});
	} catch (cause) {
		if (cause instanceof JianyingTextPackageError) {
			return statusWithPackage({
				status: inspection.status,
				state: cause.code,
				message: cause.message,
				packageReady: false,
				resourceId: reference.resourceId,
				packageHash: reference.packageHash,
				missingDependencies: cause.missingDependencies,
			});
		}
		return statusWithPackage({
			status: inspection.status,
			state: "error",
			message: cause instanceof Error ? cause.message : String(cause),
			packageReady: false,
			resourceId: reference.resourceId,
			packageHash: reference.packageHash,
		});
	}
}

export function setupJianyingTextRuntimeIPC(): JianyingTextRuntimeIPCController {
	ipcMain.handle(
		JIANYING_TEXT_RUNTIME_INSPECT_CHANNEL,
		(_event, request?: JianyingTextRuntimeInspectRequest) =>
			inspectReference({ request })
	);
	ipcMain.handle(
		JIANYING_TEXT_RUNTIME_RENDER_CHANNEL,
		(_event, request: JianyingTextRuntimeRenderRequest) =>
			renderJianyingText({ request })
	);
	ipcMain.handle(
		JIANYING_TEXT_RUNTIME_CANCEL_CHANNEL,
		(_event, request: unknown) => {
			if (
				!request ||
				typeof request !== "object" ||
				!("requestId" in request) ||
				typeof request.requestId !== "string"
			) {
				return false;
			}
			const cancelled = cancelJianyingTextRender({
				requestId: request.requestId,
			});
			return cancelled;
		}
	);
	return {
		dispose: () => {
			ipcMain.removeHandler(JIANYING_TEXT_RUNTIME_INSPECT_CHANNEL);
			ipcMain.removeHandler(JIANYING_TEXT_RUNTIME_RENDER_CHANNEL);
			ipcMain.removeHandler(JIANYING_TEXT_RUNTIME_CANCEL_CHANNEL);
		},
	};
}
