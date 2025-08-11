import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { PanelViewType } from '@/types/panel';

interface PanelTabsProps {
  activeTab: PanelViewType;
  onTabChange: (tab: PanelViewType) => void;
}

export function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="flex border-b border-border">
      <button
        onClick={() => onTabChange('properties')}
        className={cn(
          "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
          activeTab === 'properties' 
            ? "border-primary text-primary" 
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Properties
      </button>
      <div className="flex items-center">
        <button
          onClick={() => onTabChange('export')}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'export' 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Export
          {activeTab === 'export' && (
            <X 
              size={14} 
              onClick={(e) => {
                e.stopPropagation();
                onTabChange('properties');
              }}
              className="hover:text-red-500 cursor-pointer"
            />
          )}
        </button>
      </div>
    </div>
  );
}