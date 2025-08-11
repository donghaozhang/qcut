import React from 'react';
import { cn } from '@/lib/utils';

interface PanelTabsProps {
  activeTab: 'properties' | 'export';
  onTabChange: (tab: 'properties' | 'export') => void;
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
      <button
        onClick={() => onTabChange('export')}
        className={cn(
          "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
          activeTab === 'export' 
            ? "border-primary text-primary" 
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        Export
      </button>
    </div>
  );
}