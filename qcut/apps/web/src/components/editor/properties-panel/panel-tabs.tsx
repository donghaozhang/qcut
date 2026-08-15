import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { PanelViewType, PanelView } from "@/types/panel";
import { useTranslation } from "@/lib/i18n";

interface PanelTabsProps {
	activeTab: PanelViewType;
	onTabChange: (tab: PanelViewType) => void;
}

export function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
	const { t } = useTranslation();

	return (
		<div className="flex border-b border-border">
			<button
				type="button"
				data-testid="panel-tab-properties"
				onClick={() => onTabChange(PanelView.PROPERTIES)}
				className={cn(
					"px-3 py-2 text-sm font-medium border-b-2 transition-colors",
					activeTab === PanelView.PROPERTIES
						? "border-primary text-primary"
						: "border-transparent text-muted-foreground hover:text-foreground"
				)}
			>
				{t("editor.panel.properties")}
			</button>
			{/* Export opens only from the header's export button; the tab exists
			    just while that view is active so it can be closed again. */}
			{activeTab === PanelView.EXPORT && (
				<div className="flex items-center">
					<button
						type="button"
						data-testid="panel-tab-export"
						onClick={() => onTabChange(PanelView.EXPORT)}
						className="flex items-center gap-2 border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary transition-colors"
					>
						{t("editor.panel.export")}
						<X
							size={14}
							onClick={(e) => {
								e.stopPropagation();
								onTabChange(PanelView.PROPERTIES);
							}}
							className="hover:text-red-500 cursor-pointer"
						/>
					</button>
				</div>
			)}
			<button
				type="button"
				data-testid="panel-tab-settings"
				onClick={() => onTabChange(PanelView.SETTINGS)}
				className={cn(
					"px-3 py-2 text-sm font-medium border-b-2 transition-colors",
					activeTab === PanelView.SETTINGS
						? "border-primary text-primary"
						: "border-transparent text-muted-foreground hover:text-foreground"
				)}
			>
				{t("editor.panel.apiKeys")}
			</button>
		</div>
	);
}
