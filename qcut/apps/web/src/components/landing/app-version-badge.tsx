"use client";

import { useAppVersion } from "@/hooks/use-app-version";

export function AppVersionBadge() {
	const appVersion = useAppVersion();

	return (
		<div
			className="mb-5 flex min-h-7 items-center justify-center"
			aria-live="polite"
		>
			{appVersion && (
				<span
					className="inline-flex items-center whitespace-nowrap rounded-full bg-yellow-500 px-3 py-1.5 text-xs font-bold tracking-wide text-black shadow-[0_0_24px_rgba(234,179,8,0.2)]"
					title={`QCut version ${appVersion}`}
					aria-label={`QCut version ${appVersion}`}
					data-testid="app-version"
				>
					QCut&nbsp;·&nbsp;v{appVersion}
				</span>
			)}
		</div>
	);
}
