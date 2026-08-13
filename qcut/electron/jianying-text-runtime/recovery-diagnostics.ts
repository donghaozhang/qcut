import type {
	JianyingTextResourceRecoveryFailureReason,
	JianyingTextRuntimeDependencyRole,
	JianyingTextRuntimeDiagnostic,
} from "../jianying-text-runtime-contract.js";

function dependencyLabel({
	role,
}: {
	role: JianyingTextRuntimeDependencyRole;
}) {
	if (role === "animation") return "动画";
	if (role === "effect-style") return "花字外观";
	if (role === "font") return "字体";
	return "贴纸";
}

export function jianyingTextRecoveryFailureMessage({
	reason,
	resourceId,
	role,
}: {
	reason: JianyingTextResourceRecoveryFailureReason;
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
}) {
	const resource = `${dependencyLabel({ role })} ${resourceId}`;
	if (reason === "recovery-disabled") {
		return `${resource} 不在本机缓存中，且自动恢复已关闭。`;
	}
	if (reason === "catalog-missing") {
		return `${resource} 不在本机缓存中，剪映资源目录也没有可恢复记录。`;
	}
	if (reason === "hash-mismatch") {
		return `${resource} 只有其他版本，项目要求的精确版本无法恢复。`;
	}
	if (reason === "package-invalid") {
		return `${resource} 的恢复包损坏或类型不匹配。`;
	}
	return `${resource} 下载失败或剪映签名链接已经过期。`;
}

export function jianyingTextRecoveryFailureDiagnostic({
	reason,
	resourceId,
	role,
}: {
	reason: JianyingTextResourceRecoveryFailureReason;
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
}): JianyingTextRuntimeDiagnostic {
	return {
		code: "resource-recovery-unavailable",
		severity: "warning",
		message: jianyingTextRecoveryFailureMessage({
			reason,
			resourceId,
			role,
		}),
		resourceId,
		recoveryReason: reason,
	};
}
