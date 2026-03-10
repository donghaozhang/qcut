/**
 * Wrapper that only renders children on desktop (Electron).
 * On web, shows an optional fallback message.
 */

import type { ReactNode } from "react";
import { useIsDesktop } from "@/hooks/use-platform-capability";

interface DesktopOnlyProps {
	children: ReactNode;
	/** Fallback shown on web. Defaults to nothing (hidden). */
	fallback?: ReactNode;
}

export function DesktopOnly({ children, fallback = null }: DesktopOnlyProps) {
	const isDesktop = useIsDesktop();
	if (isDesktop) return <>{children}</>;
	return <>{fallback}</>;
}

interface WebUnavailableProps {
	/** Feature name for the message */
	feature: string;
}

/** Subtle banner indicating a feature requires the desktop app. */
export function WebUnavailable({ feature }: WebUnavailableProps) {
	return (
		<div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
			<span>{feature} requires the QCut desktop app.</span>
		</div>
	);
}
