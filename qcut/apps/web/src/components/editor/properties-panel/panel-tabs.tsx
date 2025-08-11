import React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { PanelViewType, PanelView } from "@/types/panel";

interface PanelTabsProps {
  activeTab: PanelViewType;
  onTabChange: (tab: PanelViewType) => void;
}

export function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="flex border-b border-border">
      <button
        type="button"
        onClick={() => onTabChange(PanelView.PROPERTIES)}
        className={cn(
          "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
          activeTab === PanelView.PROPERTIES
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Properties
      </button>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onTabChange(PanelView.EXPORT)}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === PanelView.EXPORT
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Export
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
    </div>
  );
}
