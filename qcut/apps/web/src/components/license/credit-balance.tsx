import { Coins } from "lucide-react";
import { useLicenseStore } from "@/stores/license-store";
import { PLAN_CREDITS } from "@/lib/feature-gates";
import { cn } from "@/lib/utils";

function getCreditColors(totalCredits: number, planMax: number) {
	if (planMax <= 0) return { text: "text-muted-foreground", bg: "bg-muted" };
	const pct = totalCredits / planMax;
	if (pct <= 0.1) return { text: "text-red-500", bg: "bg-red-500/10" };
	if (pct <= 0.3) return { text: "text-orange-500", bg: "bg-orange-500/10" };
	return { text: "text-emerald-500", bg: "bg-emerald-500/10" };
}

/** Compact credit balance display for editor toolbar with visual indicators */
export function CreditBalance() {
	const license = useLicenseStore((s) => s.license);
	const openBuyCreditsPage = useLicenseStore((s) => s.openBuyCreditsPage);

	if (!license) return null;

	const { totalCredits } = license.credits;
	const planMax = PLAN_CREDITS[license.plan] ?? 50;
	const colors = getCreditColors(totalCredits, planMax);

	return (
		<button
			type="button"
			onClick={openBuyCreditsPage}
			className={cn(
				"flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors hover:opacity-80",
				colors.bg,
				colors.text
			)}
			title="Buy more credits"
		>
			<Coins className="h-3 w-3" aria-hidden="true" />
			<span>{totalCredits}</span>
		</button>
	);
}
