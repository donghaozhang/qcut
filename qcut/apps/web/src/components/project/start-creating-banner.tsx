import { Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

/**
 * Wide gradient call-to-action strip at the top of the studio page.
 * Clicking it creates a new project.
 */
export function StartCreatingBanner({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation();

	return (
		<button
			type="button"
			onClick={onClick}
			data-testid="start-creating-banner"
			className="group relative w-full h-24 md:h-28 mb-8 rounded-xl overflow-hidden text-white shadow-md transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
		>
			<div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500 transition-[filter] duration-200 group-hover:brightness-110" />
			<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_55%)]" />
			<div className="relative h-full flex items-center justify-center gap-3">
				<span className="flex items-center justify-center size-8 rounded-full bg-white/25 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
					<Plus className="size-5" />
				</span>
				<span className="text-lg md:text-xl font-semibold tracking-wide">
					{t("projects.startCreating")}
				</span>
			</div>
		</button>
	);
}
