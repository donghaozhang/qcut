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

function degradedPackageMessage({
	diagnostics,
}: {
	diagnostics: NonNullable<JianyingTextRuntimeStatus["diagnostics"]>;
}) {
	const primary = diagnostics[0]?.message;
	if (!primary) {
		return "部分花字资源不可用，将使用仍可用的图层或模板默认状态继续渲染。";
	}
	const remaining = diagnostics.length - 1;
	return `${primary}${remaining > 0 ? ` 另有 ${remaining} 个资源问题。` : ""} 可用部分仍会继续渲染。`;
}

function statusWithPackage({
	status,
	state,
	message,
	packageReady,
	resourceId,
	packageHash,
	templateDuration,
	capabilities,
	diagnostics,
	missingDependencies,
	degradedDependencies,
}: {
	status: JianyingTextRuntimeStatus;
	state: JianyingTextRuntimeStatus["state"];
	message: string;
	packageReady: boolean;
	resourceId?: string;
	packageHash?: string;
	templateDuration?: number;
	capabilities?: JianyingTextRuntimeStatus["capabilities"];
	diagnostics?: JianyingTextRuntimeStatus["diagnostics"];
	missingDependencies?: JianyingTextRuntimeStatus["missingDependencies"];
	degradedDependencies?: JianyingTextRuntimeStatus["degradedDependencies"];
}): JianyingTextRuntimeStatus {
	return {
		...status,
		state,
		message,
		packageReady,
		...(resourceId ? { resourceId } : {}),
		...(packageHash ? { packageHash } : {}),
		...(templateDuration ? { templateDuration } : {}),
		...(capabilities ? { capabilities } : {}),
		...(diagnostics?.length ? { diagnostics } : {}),
		...(missingDependencies ? { missingDependencies } : {}),
		...(degradedDependencies?.length ? { degradedDependencies } : {}),
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
		const scriptResources = packageInfo.scriptResources;
		const degradedDependencies = [
			...(scriptResources?.degraded ?? []),
			...(scriptResources?.missing ?? []).flatMap(({ resourceId, role }) =>
				role === "effect-style"
					? [{ resourceId, role: "effect-style" as const }]
					: []
			),
		];
		const degraded =
			Boolean(degradedDependencies?.length) ||
			packageInfo.diagnostics.length > 0;
		return statusWithPackage({
			status: inspection.status,
			state: degraded ? "ready-degraded" : "ready",
			message: degraded
				? degradedPackageMessage({
						diagnostics: packageInfo.diagnostics,
					})
				: "剪映原版花字资源与本机运行时均已就绪。",
			packageReady: true,
			resourceId: packageInfo.resourceId,
			packageHash: packageInfo.packageHash,
			templateDuration: packageInfo.templateDuration,
			capabilities: packageInfo.capabilities,
			diagnostics: packageInfo.diagnostics,
			degradedDependencies,
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
