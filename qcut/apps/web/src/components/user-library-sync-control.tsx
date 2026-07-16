import {
	Check,
	Cloud,
	CloudOff,
	LoaderCircle,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { translate, type AppLocale, useTranslation } from "@/lib/i18n";
import { useUserLibrarySyncStore } from "@/stores/user-library-sync-store";

function statusLabel({
	status,
	error,
	locale,
}: {
	status: ReturnType<typeof useUserLibrarySyncStore.getState>["status"];
	error: string | null;
	locale: AppLocale;
}): string {
	if (status === "syncing") {
		return translate({ locale, key: "librarySync.syncing" });
	}
	if (status === "synced") {
		return translate({ locale, key: "librarySync.synced" });
	}
	if (status === "offline") {
		return translate({ locale, key: "librarySync.offline" });
	}
	if (status === "signed-out") {
		return translate({ locale, key: "librarySync.signedOut" });
	}
	if (status === "error") {
		return error ?? translate({ locale, key: "librarySync.failed" });
	}
	return translate({ locale, key: "librarySync.idle" });
}

function StatusIcon({
	status,
}: {
	status: ReturnType<typeof useUserLibrarySyncStore.getState>["status"];
}) {
	const { t } = useTranslation();
	if (status === "syncing") {
		return (
			<LoaderCircle className="size-3.5 animate-spin">
				<title>{t("librarySync.syncing")}</title>
			</LoaderCircle>
		);
	}
	if (status === "synced") {
		return (
			<span className="relative">
				<Cloud className="size-4" />
				<Check className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-background text-emerald-500" />
			</span>
		);
	}
	if (status === "offline" || status === "signed-out") {
		return (
			<CloudOff className="size-4">
				<title>
					{status === "offline"
						? t("librarySync.offline")
						: t("librarySync.signedOut")}
				</title>
			</CloudOff>
		);
	}
	if (status === "error") {
		return (
			<TriangleAlert className="size-4 text-amber-500">
				<title>{t("librarySync.failed")}</title>
			</TriangleAlert>
		);
	}
	return (
		<RefreshCw className="size-4">
			<title>{t("librarySync.idle")}</title>
		</RefreshCw>
	);
}

export function UserLibrarySyncControl() {
	const { locale } = useTranslation();
	const status = useUserLibrarySyncStore((state) => state.status);
	const error = useUserLibrarySyncStore((state) => state.error);
	const sync = useUserLibrarySyncStore((state) => state.sync);
	const label = statusLabel({ status, error, locale });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					aria-label={label}
					title={label}
					disabled={status === "syncing"}
					onClick={() => void sync()}
					onKeyDown={() => undefined}
					data-testid="user-library-sync"
				>
					<StatusIcon status={status} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
