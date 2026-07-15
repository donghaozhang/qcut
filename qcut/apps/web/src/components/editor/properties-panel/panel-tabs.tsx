import { cn } from "@/lib/utils";
import { Settings, X } from "lucide-react";
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
			<div className="flex items-center">
				<button
					type="button"
					data-testid="panel-tab-export"
					onClick={() => onTabChange(PanelView.EXPORT)}
					className={cn(
						"px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
						activeTab === PanelView.EXPORT
							? "border-primary text-primary"
							: "border-transparent text-muted-foreground hover:text-foreground"
					)}
				>
					{t("editor.panel.export")}
					{activeTab === PanelView.EXPORT && (
						<X
							size={14}
							onClick={(e) => {
								e.stopPropagation();
								onTabChange(PanelView.PROPERTIES);
							}}
							className="hover:text-red-500 cursor-pointer"
						/>
					)}
				</button>
			</div>
			<button
				type="button"
				data-testid="panel-tab-settings"
				onClick={() => onTabChange(PanelView.SETTINGS)}
				className={cn(
					"flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
					activeTab === PanelView.SETTINGS
						? "border-primary text-primary"
						: "border-transparent text-muted-foreground hover:text-foreground"
				)}
			>
				<Settings className="h-3.5 w-3.5" />
				{t("editor.panel.settings")}
			</button>
		</div>
	);
}
